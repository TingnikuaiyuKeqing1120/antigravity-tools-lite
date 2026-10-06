use chrono::{NaiveDate, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

const GEMINI_PRICING_URL: &str = "https://ai.google.dev/gemini-api/docs/pricing?hl=en";
const AGENT_PLATFORM_PRICING_URL: &str =
    "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=en";
const CACHE_TTL_SECONDS: i64 = 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiPricing {
    pub model: String,
    pub input: f64,
    pub output: f64,
    pub cached: f64,
    #[serde(default)]
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomPricingEntry {
    pub model: String,
    pub input: f64,
    pub output: f64,
    pub cached: f64,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiPricingSnapshot {
    pub prices: Vec<ApiPricing>,
    pub fetched_at: i64,
    pub stale: bool,
    pub source: String,
    pub warning: Option<String>,
}

/// Fetch public Google pricing pages once per day. Only pricing metadata is cached locally;
/// no account, prompt, or conversation data is sent.
pub async fn get_api_pricing() -> Result<ApiPricingSnapshot, String> {
    let now = Utc::now().timestamp();
    if let Some(mut cached) = read_cache() {
        if now.saturating_sub(cached.fetched_at) < CACHE_TTL_SECONDS && !cached.prices.is_empty() {
            cached.stale = false;
            cached.warning = None;
            let custom = read_custom_pricing();
            apply_custom_pricing(&mut cached, &custom);
            return Ok(cached);
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("Antigravity Tools local usage dashboard")
        .build()
        .map_err(|error| error.to_string())?;

    let (gemini_result, agent_platform_result) = tokio::join!(
        fetch_page(&client, GEMINI_PRICING_URL),
        fetch_page(&client, AGENT_PLATFORM_PRICING_URL),
    );

    let today = Utc::now().date_naive();
    let mut prices = Vec::new();
    let mut warnings = Vec::new();

    match gemini_result {
        Ok(html) => prices.extend(parse_gemini_prices(&html, today)),
        Err(error) => warnings.push(format!("Gemini 价格页：{}", error)),
    }
    match agent_platform_result {
        Ok(html) => prices.extend(parse_agent_platform_prices(&html, today)),
        Err(error) => warnings.push(format!("Google Agent Platform 价格页：{}", error)),
    }

    let mut unique_prices = BTreeMap::new();
    for price in prices {
        unique_prices.insert(price.model.to_ascii_lowercase(), price);
    }
    let prices: Vec<ApiPricing> = unique_prices.into_values().collect();

    if !prices.is_empty() {
        let snapshot = ApiPricingSnapshot {
            prices,
            fetched_at: now,
            stale: false,
            source: "Google Gemini API + Google Agent Platform 官方价格".to_string(),
            warning: (!warnings.is_empty()).then(|| warnings.join("；")),
        };
        write_cache(&snapshot);
        let mut snapshot_with_custom = snapshot;
        let custom = read_custom_pricing();
        apply_custom_pricing(&mut snapshot_with_custom, &custom);
        return Ok(snapshot_with_custom);
    }

    if let Some(mut cached) = read_cache() {
        cached.stale = true;
        cached.warning = Some(if warnings.is_empty() {
            "官方价格页暂时没有解析到可用价格，继续使用本地缓存".to_string()
        } else {
            format!("{}；继续使用本地缓存", warnings.join("；"))
        });
        let custom = read_custom_pricing();
        apply_custom_pricing(&mut cached, &custom);
        return Ok(cached);
    }

    let mut fallback = ApiPricingSnapshot {
        prices: Vec::new(),
        fetched_at: now,
        stale: true,
        source: "内置价格兜底".to_string(),
        warning: Some(if warnings.is_empty() {
            "官方价格页暂时没有解析到可用价格".to_string()
        } else {
            warnings.join("；")
        }),
    };
    let custom = read_custom_pricing();
    apply_custom_pricing(&mut fallback, &custom);
    Ok(fallback)
}

async fn fetch_page(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status));
    }
    response.text().await.map_err(|error| error.to_string())
}

fn cache_path() -> Option<PathBuf> {
    let root = std::env::var_os("ABV_DATA_DIR").filter(|path| !path.to_string_lossy().trim().is_empty()).map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".antigravity_tools")))?;
    Some(root.join("api_pricing.json"))
}

pub fn custom_pricing_path() -> Option<PathBuf> {
    let root = std::env::var_os("ABV_DATA_DIR")
        .filter(|path| !path.to_string_lossy().trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".antigravity_tools")))?;
    Some(root.join("custom_pricing.json"))
}

pub fn get_custom_pricing_file_path() -> Result<String, String> {
    custom_pricing_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "无法获取自定义价格配置文件路径".to_string())
}

pub fn read_custom_pricing() -> Vec<CustomPricingEntry> {
    let Some(path) = custom_pricing_path() else {
        return Vec::new();
    };
    let Ok(bytes) = fs::read(path) else {
        return Vec::new();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn save_custom_pricing(entries: Vec<CustomPricingEntry>) -> Result<(), String> {
    let path = custom_pricing_path().ok_or_else(|| "无法获取数据目录路径".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn apply_custom_pricing(snapshot: &mut ApiPricingSnapshot, custom_entries: &[CustomPricingEntry]) {
    for entry in custom_entries {
        if !entry.enabled {
            continue;
        }
        let lower = entry.model.trim().to_ascii_lowercase();
        if lower.is_empty() {
            continue;
        }
        if let Some(existing) = snapshot
            .prices
            .iter_mut()
            .find(|p| p.model.trim().to_ascii_lowercase() == lower)
        {
            existing.input = entry.input;
            existing.output = entry.output;
            existing.cached = entry.cached;
            existing.is_custom = true;
        } else {
            snapshot.prices.push(ApiPricing {
                model: entry.model.trim().to_string(),
                input: entry.input,
                output: entry.output,
                cached: entry.cached,
                is_custom: true,
            });
        }
    }
}

pub fn cached_pricing() -> Option<ApiPricingSnapshot> {
    let mut snapshot = read_cache()?;
    snapshot.stale = Utc::now().timestamp().saturating_sub(snapshot.fetched_at) >= CACHE_TTL_SECONDS;
    let custom = read_custom_pricing();
    apply_custom_pricing(&mut snapshot, &custom);
    Some(snapshot)
}

fn read_cache() -> Option<ApiPricingSnapshot> {
    let path = cache_path()?;
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_cache(snapshot: &ApiPricingSnapshot) {
    let Some(path) = cache_path() else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    if let Ok(bytes) = serde_json::to_vec_pretty(snapshot) {
        let _ = fs::write(path, bytes);
    }
}

fn parse_gemini_prices(html: &str, today: NaiveDate) -> Vec<ApiPricing> {
    let heading_regex = Regex::new(r#"(?is)<h2\b[^>]*\bid="(gemini-[^"]+)"[^>]*>.*?</h2>"#)
        .expect("valid Gemini heading regex");
    let mut headings = Vec::new();
    for capture in heading_regex.captures_iter(html) {
        let Some(full) = capture.get(0) else {
            continue;
        };
        let Some(model) = capture.get(1) else {
            continue;
        };
        headings.push((full.start(), full.end(), model.as_str().to_string()));
    }

    headings
        .iter()
        .enumerate()
        .filter_map(|(index, (_, end, model))| {
            let section_end = headings
                .get(index + 1)
                .map(|heading| heading.0)
                .unwrap_or(html.len());
            parse_gemini_section(&html[*end..section_end], model, today)
        })
        .collect()
}

fn parse_gemini_section(section: &str, model: &str, today: NaiveDate) -> Option<ApiPricing> {
    let standard_heading_regex = Regex::new(r#"(?is)<h3\b[^>]*\bid="standard"[^>]*>.*?</h3>"#)
        .expect("valid Standard heading regex");
    let standard_heading = standard_heading_regex.find(section)?;
    let after_heading = &section[standard_heading.end()..];
    let table_start = after_heading.find("<table")?;
    let table = &after_heading[table_start..];
    let table_end = table.find("</table>")? + "</table>".len();
    let rows = parse_table_rows(&table[..table_end]);

    let mut input = None;
    let mut output = None;
    let mut cached = None;
    for cells in rows {
        if cells.len() < 3 {
            continue;
        }
        let label = cells[0].to_ascii_lowercase();
        if label.starts_with("input price") {
            input = parse_effective_price(&cells[2], today, false);
        } else if label.starts_with("output price") {
            output = parse_effective_price(&cells[2], today, model.contains("image"));
        } else if label.starts_with("context caching price") {
            cached = parse_effective_price(&cells[2], today, false);
        }
    }

    Some(ApiPricing {
        model: model.to_string(),
        input: input?,
        output: output?,
        cached: cached.unwrap_or(0.0),
        is_custom: false,
    })
}

fn parse_agent_platform_prices(html: &str, today: NaiveDate) -> Vec<ApiPricing> {
    let mut records: BTreeMap<String, ApiPricing> = BTreeMap::new();
    let mut current_model = None;

    for cells in parse_table_rows(html) {
        if cells.len() < 3 {
            continue;
        }
        if !cells[0].is_empty() {
            current_model = Some(cells[0].clone());
        }
        let Some(model) = current_model.as_ref() else {
            continue;
        };
        if !model.to_ascii_lowercase().contains("claude") {
            continue;
        }

        let kind = cells[1].to_ascii_lowercase();
        if !matches!(kind.as_str(), "input" | "output" | "cache hit") {
            continue;
        }
        let Some(value) = parse_effective_price(&cells[2], today, false) else {
            continue;
        };
        let entry = records.entry(model.clone()).or_insert_with(|| ApiPricing {
            model: model.clone(),
            input: 0.0,
            output: 0.0,
            cached: 0.0,
            is_custom: false,
        });
        match kind.as_str() {
            "input" if entry.input == 0.0 => entry.input = value,
            "output" if entry.output == 0.0 => entry.output = value,
            "cache hit" if entry.cached == 0.0 => entry.cached = value,
            _ => {}
        }
    }

    records
        .into_values()
        .filter(|price| price.input > 0.0 && price.output > 0.0)
        .collect()
}

fn parse_table_rows(table: &str) -> Vec<Vec<String>> {
    let row_regex = Regex::new(r"(?is)<tr\b[^>]*>(.*?)</tr>").expect("valid row regex");
    let cell_regex = Regex::new(r"(?is)<td\b[^>]*>(.*?)</td>").expect("valid cell regex");
    row_regex
        .captures_iter(table)
        .map(|row| {
            cell_regex
                .captures_iter(row.get(1).map(|value| value.as_str()).unwrap_or_default())
                .map(|cell| clean_text(cell.get(1).map(|value| value.as_str()).unwrap_or_default()))
                .collect()
        })
        .collect()
}

fn clean_text(value: &str) -> String {
    let tag_regex = Regex::new(r"(?is)<[^>]+>").expect("valid tag regex");
    let value = tag_regex.replace_all(value, " ");
    value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_effective_price(value: &str, today: NaiveDate, prefer_image: bool) -> Option<f64> {
    let value = clean_text(value);
    let money_regex = Regex::new(r"\$(\d+(?:\.\d+)?)").expect("valid money regex");

    if prefer_image {
        let image_regex = Regex::new(r"(?i)\$(\d+(?:\.\d+)?)\s*\(\s*images?\s*\)")
            .expect("valid image price regex");
        if let Some(capture) = image_regex.captures(&value) {
            return capture.get(1)?.as_str().parse().ok();
        }
    }

    let matches: Vec<_> = money_regex.find_iter(&value).collect();
    let mut fallback = None;
    let date_regex = Regex::new(r"(?i)(through|starting)\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})")
        .expect("valid price date regex");

    for (index, money) in matches.iter().enumerate() {
        let amount = money.as_str().trim_start_matches('$').parse::<f64>().ok()?;
        fallback.get_or_insert(amount);
        let next_start = matches
            .get(index + 1)
            .map(|next| next.start())
            .unwrap_or(value.len());
        let context = &value[money.end()..next_start];
        let Some(date_capture) = date_regex.captures(context) else {
            continue;
        };
        let Some(date_text) = date_capture.get(2).map(|date| date.as_str()) else {
            continue;
        };
        let Some(date) = parse_price_date(date_text) else {
            continue;
        };
        let kind = date_capture
            .get(1)
            .map(|kind| kind.as_str())
            .unwrap_or_default();
        if (kind.eq_ignore_ascii_case("through") && today <= date)
            || (kind.eq_ignore_ascii_case("starting") && today >= date)
        {
            return Some(amount);
        }
    }

    fallback
}

fn parse_price_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%B %d, %Y")
        .or_else(|_| NaiveDate::parse_from_str(value, "%B %-d, %Y"))
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_current_price_from_a_scheduled_change() {
        let value = "$0.75 through December 31, 2026. $1.50 starting January 1, 2027.";
        assert_eq!(
            parse_effective_price(value, NaiveDate::from_ymd_opt(2026, 9, 15).unwrap(), false),
            Some(0.75)
        );
        assert_eq!(
            parse_effective_price(value, NaiveDate::from_ymd_opt(2027, 1, 2).unwrap(), false),
            Some(1.5)
        );
    }

    #[test]
    fn picks_image_output_price_when_a_model_has_two_output_types() {
        let value = "$3 (text and thinking) $60.00 (images)";
        assert_eq!(
            parse_effective_price(value, NaiveDate::from_ymd_opt(2026, 9, 15).unwrap(), true),
            Some(60.0)
        );
    }

    #[test]
    fn parses_gemini_model_sections() {
        let html = r#"
            <h2 id="gemini-3.9-flash">Gemini 3.9 Flash</h2>
            <h3 id="standard">Standard</h3>
            <table>
              <tr><td>Input price</td><td>Free</td><td>$0.80</td></tr>
              <tr><td>Output price</td><td>Free</td><td>$4.00</td></tr>
              <tr><td>Context caching price</td><td>Free</td><td>$0.08</td></tr>
            </table>
        "#;
        let prices = parse_gemini_prices(html, NaiveDate::from_ymd_opt(2026, 9, 15).unwrap());
        assert_eq!(prices.len(), 1);
        assert_eq!(prices[0].model, "gemini-3.9-flash");
        assert_eq!(prices[0].output, 4.0);
    }

    #[test]
    fn applies_custom_pricing_overrides_and_additions() {
        let mut snapshot = ApiPricingSnapshot {
            prices: vec![
                ApiPricing {
                    model: "gemini-3.8-flash".into(),
                    input: 0.5,
                    output: 2.0,
                    cached: 0.05,
                    is_custom: false,
                },
            ],
            fetched_at: 1000,
            stale: false,
            source: "test".into(),
            warning: None,
        };

        let custom_entries = vec![
            CustomPricingEntry {
                model: "gemini-3.8-flash".into(),
                input: 0.1,
                output: 0.4,
                cached: 0.01,
                enabled: true,
            },
            CustomPricingEntry {
                model: "deepseek-v3".into(),
                input: 0.14,
                output: 0.28,
                cached: 0.014,
                enabled: true,
            },
            CustomPricingEntry {
                model: "disabled-model".into(),
                input: 1.0,
                output: 2.0,
                cached: 0.1,
                enabled: false,
            },
        ];

        apply_custom_pricing(&mut snapshot, &custom_entries);

        assert_eq!(snapshot.prices.len(), 2);
        let flash = snapshot.prices.iter().find(|p| p.model == "gemini-3.8-flash").unwrap();
        assert_eq!(flash.input, 0.1);
        assert_eq!(flash.output, 0.4);
        assert!(flash.is_custom);

        let deepseek = snapshot.prices.iter().find(|p| p.model == "deepseek-v3").unwrap();
        assert_eq!(deepseek.input, 0.14);
        assert_eq!(deepseek.output, 0.28);
        assert!(deepseek.is_custom);

        assert!(snapshot.prices.iter().all(|p| p.model != "disabled-model"));
    }
}
