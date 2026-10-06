import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    Check,
    Coins,
    Copy,
    Edit3,
    FileCode,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { request as invoke } from '../../utils/request';
import { showToast } from '../common/ToastContainer';
import { CustomPricingEntry, ApiPricingSnapshot } from '../../types/pricing';

interface CustomPricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPricingUpdated?: () => void;
}

export default function CustomPricingModal({
    isOpen,
    onClose,
    onPricingUpdated,
}: CustomPricingModalProps) {
    const { t } = useTranslation();
    const [customEntries, setCustomEntries] = useState<CustomPricingEntry[]>([]);
    const [snapshot, setSnapshot] = useState<ApiPricingSnapshot | null>(null);
    const [configPath, setConfigPath] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');

    // 编辑/新建表单状态
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
    const [formModel, setFormModel] = useState<string>('');
    const [formInput, setFormInput] = useState<string>('');
    const [formOutput, setFormOutput] = useState<string>('');
    const [formCached, setFormCached] = useState<string>('');
    const [formEnabled, setFormEnabled] = useState<boolean>(true);
    const [copied, setCopied] = useState<boolean>(false);

    // ESC 关闭
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isFormOpen) {
                    setIsFormOpen(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isFormOpen, onClose]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [customList, snap, path] = await Promise.all([
                invoke<CustomPricingEntry[]>('get_custom_pricing').catch(() => []),
                invoke<ApiPricingSnapshot>('get_api_pricing').catch(() => null),
                invoke<string>('get_custom_pricing_file_path').catch(() => '~/.antigravity_tools/custom_pricing.json'),
            ]);
            setCustomEntries(customList || []);
            setSnapshot(snap);
            setConfigPath(path);
        } catch (e) {
            console.error('Failed to load custom pricing data:', e);
            showToast(t('custom_pricing.load_failed', '加载价格配置失败'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadData();
            setIsFormOpen(false);
            setEditingIndex(null);
            setSearchQuery('');
        }
    }, [isOpen]);

    const handleCopyPath = async () => {
        if (!configPath) return;
        try {
            await navigator.clipboard.writeText(configPath);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            showToast(t('common.copied', '已复制到剪贴板'), 'success');
        } catch {
            showToast(t('common.copy_failed', '复制失败'), 'error');
        }
    };

    const handleOpenAddForm = (presetModel?: string, presetInput?: number, presetOutput?: number, presetCached?: number) => {
        setEditingIndex(null);
        setFormModel(presetModel || '');
        setFormInput(presetInput !== undefined ? String(presetInput) : '');
        setFormOutput(presetOutput !== undefined ? String(presetOutput) : '');
        setFormCached(presetCached !== undefined ? String(presetCached) : '0');
        setFormEnabled(true);
        setIsFormOpen(true);
    };

    const handleOpenEditForm = (entry: CustomPricingEntry, index: number) => {
        setEditingIndex(index);
        setFormModel(entry.model);
        setFormInput(String(entry.input));
        setFormOutput(String(entry.output));
        setFormCached(String(entry.cached));
        setFormEnabled(entry.enabled);
        setIsFormOpen(true);
    };

    const handleSaveForm = async (e: React.FormEvent) => {
        e.preventDefault();
        const model = formModel.trim();
        if (!model) {
            showToast(t('custom_pricing.model_required', '请输入模型标识'), 'error');
            return;
        }

        const input = parseFloat(formInput);
        const output = parseFloat(formOutput);
        const cached = parseFloat(formCached || '0');

        if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0 || !Number.isFinite(cached) || cached < 0) {
            showToast(t('custom_pricing.price_invalid', '请输入有效的单价数值（非负数）'), 'error');
            return;
        }

        const nextEntries = [...customEntries];
        const newEntry: CustomPricingEntry = {
            model,
            input,
            output,
            cached,
            enabled: formEnabled,
        };

        if (editingIndex !== null && editingIndex >= 0 && editingIndex < nextEntries.length) {
            nextEntries[editingIndex] = newEntry;
        } else {
            // Check if model already exists
            const existingIdx = nextEntries.findIndex(
                item => item.model.trim().toLowerCase() === model.toLowerCase()
            );
            if (existingIdx >= 0) {
                nextEntries[existingIdx] = newEntry;
            } else {
                nextEntries.push(newEntry);
            }
        }

        await persistCustomPricing(nextEntries);
        setIsFormOpen(false);
    };

    const persistCustomPricing = async (entries: CustomPricingEntry[]) => {
        setSaving(true);
        try {
            await invoke('save_custom_pricing', { entries });
            setCustomEntries(entries);
            // Refresh API pricing snapshot
            const updatedSnap = await invoke<ApiPricingSnapshot>('get_api_pricing');
            setSnapshot(updatedSnap);
            showToast(t('custom_pricing.saved_success', '自定义价格已保存'), 'success');
            onPricingUpdated?.();
        } catch (e) {
            showToast(t('custom_pricing.save_failed', { error: String(e) }), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleEntry = async (index: number) => {
        const next = [...customEntries];
        next[index].enabled = !next[index].enabled;
        await persistCustomPricing(next);
    };

    const handleDeleteEntry = async (index: number) => {
        const next = customEntries.filter((_, i) => i !== index);
        await persistCustomPricing(next);
    };

    const handleResetAll = async () => {
        if (!window.confirm(t('custom_pricing.reset_all_confirm', '确定要恢复所有官方默认价格并清除所有自定义单价吗？'))) {
            return;
        }
        await persistCustomPricing([]);
    };

    // 整合展示列表：优先自定义，再包含官方已抓取但未被自定义的模型
    const displayRows = useMemo(() => {
        interface RowItem {
            model: string;
            input: number;
            output: number;
            cached: number;
            isCustom: boolean;
            isEnabled: boolean;
            customIndex?: number;
            sourceType: 'custom' | 'official' | 'inherited';
        }

        const map = new Map<string, RowItem>();

        // 1. 自定义项
        customEntries.forEach((entry, idx) => {
            const key = entry.model.trim().toLowerCase();
            map.set(key, {
                model: entry.model,
                input: entry.input,
                output: entry.output,
                cached: entry.cached,
                isCustom: true,
                isEnabled: entry.enabled,
                customIndex: idx,
                sourceType: 'custom',
            });
        });

        // 2. 官方项
        (snapshot?.prices || []).forEach(price => {
            const key = price.model.trim().toLowerCase();
            if (!map.has(key)) {
                map.set(key, {
                    model: price.model,
                    input: price.input,
                    output: price.output,
                    cached: price.cached,
                    isCustom: false,
                    isEnabled: true,
                    sourceType: 'official',
                });
            }
        });

        const list = Array.from(map.values());

        // 搜索过滤
        if (searchQuery.trim()) {
            const query = searchQuery.trim().toLowerCase();
            return list.filter(item => item.model.toLowerCase().includes(query));
        }

        // 默认排序：自定义排在前，其余按名称字母排序
        return list.sort((a, b) => {
            if (a.isCustom && !b.isCustom) return -1;
            if (!a.isCustom && b.isCustom) return 1;
            return a.model.localeCompare(b.model);
        });
    }, [customEntries, snapshot, searchQuery]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-200">
                {/* 头部 */}
                <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
                            <Coins className="h-5 w-5" />
                        </span>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                                {t('custom_pricing.title', '模型计价与自定义单价配置')}
                            </h2>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {t('custom_pricing.subtitle', '为模型单独设定输入、输出与缓存单价（$/1M Tokens），生效于本地费用统计与菜单栏。')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-gray-200"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* 工具栏 */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/50">
                    <div className="relative min-w-[200px] flex-1 max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder={t('custom_pricing.search_placeholder', '搜索模型 (如 flash, tiered)...')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {customEntries.length > 0 && (
                            <button
                                type="button"
                                onClick={handleResetAll}
                                disabled={saving}
                                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700 transition-colors"
                            >
                                <RotateCcw className="h-3.5 w-3.5 text-gray-400" />
                                <span>{t('custom_pricing.reset_all', '恢复官方默认')}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => handleOpenAddForm()}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            <span>{t('custom_pricing.add_custom', '添加自定义单价')}</span>
                        </button>
                    </div>
                </div>

                {/* 新建/编辑折叠表单 */}
                {isFormOpen && (
                    <form onSubmit={handleSaveForm} className="border-b border-blue-100 bg-blue-50/40 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                                {editingIndex !== null
                                    ? t('custom_pricing.edit_title', '编辑模型单价')
                                    : t('custom_pricing.add_title', '添加自定义模型单价')}
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsFormOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                    {t('custom_pricing.model_name', '模型标识')}
                                </label>
                                <input
                                    type="text"
                                    list="common-pricing-models"
                                    required
                                    placeholder="gemini-3.8-flash-tiered"
                                    value={formModel}
                                    onChange={(e) => setFormModel(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                                />
                                <datalist id="common-pricing-models">
                                    <option value="gemini-3.8-flash" />
                                    <option value="gemini-3.8-flash-tiered" />
                                    <option value="gemini-3.8-flash-n" />
                                    <option value="gemini-3.1-pro" />
                                    <option value="gemini-3.1-pro-high" />
                                    <option value="gemini-2.5-pro" />
                                    <option value="claude-sonnet-4-6" />
                                    <option value="claude-3-7-sonnet" />
                                    <option value="deepseek-v3" />
                                    <option value="deepseek-r1" />
                                </datalist>
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                    {t('custom_pricing.input_price', '输入单价 ($/1M)')}
                                </label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    required
                                    placeholder="0.75"
                                    value={formInput}
                                    onChange={(e) => setFormInput(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                    {t('custom_pricing.output_price', '输出单价 ($/1M)')}
                                </label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    required
                                    placeholder="3.75"
                                    value={formOutput}
                                    onChange={(e) => setFormOutput(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                    {t('custom_pricing.cached_price', '缓存单价 ($/1M)')}
                                </label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    placeholder="0.075"
                                    value={formCached}
                                    onChange={(e) => setFormCached(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                                />
                            </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={formEnabled}
                                    onChange={(e) => setFormEnabled(e.target.checked)}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span>{t('custom_pricing.enable_immediately', '保存后立即启用此单价')}</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsFormOpen(false)}
                                    className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
                                >
                                    {t('common.cancel', '取消')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {saving && <RefreshCw className="h-3 w-3 animate-spin" />}
                                    <span>{t('common.save', '保存单价')}</span>
                                </button>
                            </div>
                        </div>
                    </form>
                )}

                {/* 列表主体 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center text-xs text-gray-400">
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                            <span>{t('common.loading', '正在加载价格数据…')}</span>
                        </div>
                    ) : displayRows.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-xs text-gray-400">
                            <AlertCircle className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                            <span>{t('custom_pricing.no_models_found', '未找到匹配的模型')}</span>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-200/80 dark:border-slate-800">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-gray-200/80 bg-gray-50/80 text-[11px] font-semibold text-gray-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-gray-400">
                                    <tr>
                                        <th className="py-2.5 pl-3.5 pr-2">{t('custom_pricing.th_model', '模型名称')}</th>
                                        <th className="px-2 py-2.5 font-mono">{t('custom_pricing.th_input', '输入 ($/1M)')}</th>
                                        <th className="px-2 py-2.5 font-mono">{t('custom_pricing.th_output', '输出 ($/1M)')}</th>
                                        <th className="px-2 py-2.5 font-mono">{t('custom_pricing.th_cached', '缓存 ($/1M)')}</th>
                                        <th className="px-2 py-2.5 text-center">{t('custom_pricing.th_source', '来源')}</th>
                                        <th className="py-2.5 pl-2 pr-3.5 text-right">{t('custom_pricing.th_actions', '操作')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-800/60 font-mono">
                                    {displayRows.map((row) => (
                                        <tr
                                            key={row.model}
                                            className={`transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/40 ${
                                                row.isCustom && !row.isEnabled ? 'opacity-50' : ''
                                            }`}
                                        >
                                            <td className="py-2.5 pl-3.5 pr-2 font-sans font-medium text-gray-800 dark:text-gray-200">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="truncate max-w-[220px]" title={row.model}>{row.model}</span>
                                                    {row.model.endsWith('-tiered') && (
                                                        <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[9px] font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                                            Tiered
                                                        </span>
                                                    )}
                                                    {row.model.endsWith('-n') && (
                                                        <span className="rounded bg-cyan-50 px-1.5 py-0.2 text-[9px] font-medium text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400">
                                                            Inline
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300">
                                                ${row.input.toFixed(row.input < 0.01 ? 4 : 2)}
                                            </td>
                                            <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300">
                                                ${row.output.toFixed(row.output < 0.01 ? 4 : 2)}
                                            </td>
                                            <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300">
                                                ${row.cached.toFixed(row.cached < 0.01 ? 4 : 2)}
                                            </td>
                                            <td className="px-2 py-2.5 text-center font-sans">
                                                {row.isCustom ? (
                                                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                                        row.isEnabled
                                                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                            : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400'
                                                    }`}>
                                                        {row.isEnabled ? t('custom_pricing.custom_active', '自定义生效') : t('custom_pricing.custom_disabled', '已禁用')}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                                        {t('custom_pricing.official_fetch', '官方抓取')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 pl-2 pr-3.5 text-right font-sans">
                                                <div className="flex items-center justify-end gap-1">
                                                    {row.isCustom && row.customIndex !== undefined ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleEntry(row.customIndex!)}
                                                                title={row.isEnabled ? t('custom_pricing.disable', '停用') : t('custom_pricing.enable', '启用')}
                                                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                                    row.isEnabled
                                                                        ? 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800'
                                                                        : 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30'
                                                                }`}
                                                            >
                                                                {row.isEnabled ? t('custom_pricing.disable', '停用') : t('custom_pricing.enable', '启用')}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenEditForm(customEntries[row.customIndex!], row.customIndex!)}
                                                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                                                                title={t('common.edit', '编辑')}
                                                            >
                                                                <Edit3 className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteEntry(row.customIndex!)}
                                                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                                                title={t('common.delete', '删除自定义价格')}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenAddForm(row.model, row.input, row.output, row.cached)}
                                                            className="rounded px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                                                            title={t('custom_pricing.override_rate', '覆盖为自定义价格')}
                                                        >
                                                            {t('custom_pricing.customize', '自定义')}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* 底部信息栏 */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 p-4 text-xs text-gray-500 dark:border-slate-800 dark:text-gray-400">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                        <FileCode className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="truncate max-w-[320px]" title={configPath}>
                            {configPath || '~/.antigravity_tools/custom_pricing.json'}
                        </span>
                        <button
                            type="button"
                            onClick={handleCopyPath}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800"
                            title={t('common.copy_path', '复制路径')}
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        {t('common.close', '关闭')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
