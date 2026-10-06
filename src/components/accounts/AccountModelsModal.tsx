import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    Brain,
    Clock,
    Coins,
    Image as ImageIcon,
    Info,
    Layers,
    RefreshCw,
    Sparkles,
    Workflow,
    X,
    Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account } from '../../types/account';
import { getQuotaColor, formatTimeRemaining } from '../../utils/format';
import { request as invoke } from '../../utils/request';
import { showToast } from '../common/ToastContainer';

interface AccountModelsModalProps {
    isOpen: boolean;
    onClose: () => void;
    account: Account | null;
    onOpenPricingModal?: () => void;
    onAccountRefreshed?: () => void;
}

export default function AccountModelsModal({
    isOpen,
    onClose,
    account,
    onOpenPricingModal,
    onAccountRefreshed,
}: AccountModelsModalProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showExplanation, setShowExplanation] = useState(true);

    // ESC 关闭
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleRefresh = async () => {
        if (!account) return;
        setIsRefreshing(true);
        try {
            await invoke('fetch_account_quota', { accountId: account.id });
            showToast(t('accounts.refresh_success', '配额刷新成功'), 'success');
            onAccountRefreshed?.();
        } catch (e) {
            showToast(t('accounts.refresh_failed', { error: String(e) }), 'error');
        } finally {
            setIsRefreshing(false);
        }
    };

    const models = useMemo(() => {
        const raw = account?.quota?.models || [];
        if (!searchQuery.trim()) return raw;
        const q = searchQuery.trim().toLowerCase();
        return raw.filter(
            m => m.name.toLowerCase().includes(q) || (m.display_name && m.display_name.toLowerCase().includes(q))
        );
    }, [account?.quota?.models, searchQuery]);

    const getBackendInfo = (modelName: string) => {
        const name = modelName.toLowerCase();
        if (name.endsWith('-n')) {
            return {
                type: 'native',
                label: '原生补全 (-n)',
                desc: 'Native Inline Completion：原生行内代码补全专有通道，优化非思考模式与极低响应延迟。',
                badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800',
                icon: Zap,
            };
        }
        if (name.endsWith('-tiered')) {
            return {
                type: 'tiered',
                label: '分级阶梯池 (-tiered)',
                desc: 'Tiered Overflow Pool：分级溢出/后备通道，在主通道高峰期或主配额受限时作为防限流熔断备份。',
                badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
                icon: Layers,
            };
        }
        if (name.includes('image') || name.startsWith('imagen')) {
            return {
                type: 'image',
                label: '多模态图像',
                desc: 'Image Generation / Vision：视觉图像处理通道。',
                badgeColor: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
                icon: ImageIcon,
            };
        }
        return {
            type: 'standard',
            label: '标准端点',
            desc: 'Standard Endpoint：Google Cloud 官方主通道，支持标准多轮交互与深度思考。',
            badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
            icon: Sparkles,
        };
    };

    if (!isOpen || !account) return null;

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-200">
                {/* 头部 */}
                <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                            <Workflow className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                                    {account.custom_label || account.email}
                                </h2>
                                {account.quota?.subscription_tier && (
                                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                        {account.quota.subscription_tier}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {t('account_models.subtitle', 'Google Cloud Code 实际开通模型列表 (共 {{count}} 个通道)', {
                                    count: account.quota?.models?.length || 0,
                                })}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
                            title={t('accounts.refresh_quota', '刷新配额')}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
                            <span className="hidden sm:inline">{t('common.refresh', '刷新')}</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-gray-200"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* 后端通道科普横幅 */}
                {showExplanation && (
                    <div className="border-b border-gray-100 bg-blue-50/40 p-4 text-xs dark:border-slate-800 dark:bg-blue-950/20">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex gap-2">
                                <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                                <div className="space-y-1.5 text-gray-700 dark:text-gray-300">
                                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                                        💡 {t('account_models.backend_guide_title', '为什么不同账号可用模型与后缀不同？')}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 pt-1">
                                        <div className="rounded-lg border border-blue-100 bg-white/80 p-2 dark:border-blue-900/40 dark:bg-slate-900/60">
                                            <div className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                <Sparkles className="h-3 w-3" /> 标准端点 (Standard)
                                            </div>
                                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                                主配额池，支持完整上下文与深度思考能力。
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-cyan-100 bg-white/80 p-2 dark:border-cyan-900/40 dark:bg-slate-900/60">
                                            <div className="font-medium text-cyan-700 dark:text-cyan-300 flex items-center gap-1">
                                                <Zap className="h-3 w-3" /> 原生补全 (-n)
                                            </div>
                                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                                行内补全低延迟通道，不走长思考，保障输入打字极速响应。
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-indigo-100 bg-white/80 p-2 dark:border-indigo-900/40 dark:bg-slate-900/60">
                                            <div className="font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                                                <Layers className="h-3 w-3" /> 分级阶梯池 (-tiered)
                                            </div>
                                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                                防限流分级溢出池，高峰期或主额度受限时自动接管，保障可用性。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowExplanation(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                title={t('common.dismiss', '收起说明')}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* 搜索栏 */}
                <div className="border-b border-gray-100 bg-gray-50/50 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/50">
                    <input
                        type="text"
                        placeholder={t('account_models.search_placeholder', '搜索该账号模型名称 (如 flash, pro, claude)...')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                    />
                </div>

                {/* 模型卡片列表 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {models.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-xs text-gray-400">
                            <AlertCircle className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                            <span>{t('account_models.no_models', '暂无可展示的模型（请确认已刷新该账号配额）')}</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {models.map((model) => {
                                const backend = getBackendInfo(model.name);
                                const BackendIcon = backend.icon;
                                const quotaColor = getQuotaColor(model.percentage);
                                const colorClass =
                                    quotaColor === 'success'
                                        ? 'bg-emerald-500'
                                        : quotaColor === 'warning'
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500';

                                return (
                                    <div
                                        key={model.name}
                                        className="rounded-xl border border-gray-200/80 bg-white p-3.5 shadow-2xs transition-all hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700 flex flex-col justify-between"
                                    >
                                        <div>
                                            {/* 顶部标题与后端标签 */}
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-xs text-gray-900 dark:text-gray-100 truncate" title={model.name}>
                                                        {model.display_name || model.name}
                                                    </div>
                                                    <div className="text-[11px] font-mono text-gray-400 truncate" title={model.name}>
                                                        {model.name}
                                                    </div>
                                                </div>
                                                <span className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${backend.badgeColor}`}>
                                                    <BackendIcon className="h-3 w-3" />
                                                    <span>{backend.label}</span>
                                                </span>
                                            </div>

                                            {/* 配额进度条 */}
                                            <div className="space-y-1 my-2.5">
                                                <div className="flex items-center justify-between text-[11px] font-mono">
                                                    <span className="text-gray-500 dark:text-gray-400">
                                                        {t('account_models.remaining_quota', '剩余额度')}
                                                    </span>
                                                    <span className="font-bold text-gray-800 dark:text-gray-200">
                                                        {model.percentage}%
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                                                        style={{ width: `${model.percentage}%` }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-gray-400">
                                                    <span>
                                                        {model.reset_time ? (
                                                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                                <Clock className="h-2.5 w-2.5" />
                                                                <span>{formatTimeRemaining(model.reset_time)} 重置</span>
                                                            </span>
                                                        ) : (
                                                            '无重置时间'
                                                        )}
                                                    </span>
                                                    {model.recommended && (
                                                        <span className="text-blue-600 dark:text-blue-400 font-medium">推荐</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 特性能力 Pills */}
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {model.supports_thinking && (
                                                    <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                                        <Brain className="h-2.5 w-2.5" />
                                                        思考 ({model.thinking_budget ? `${model.thinking_budget / 1024}k` : '可用'})
                                                    </span>
                                                )}
                                                {model.supports_images && (
                                                    <span className="inline-flex items-center gap-1 rounded bg-pink-50 px-1.5 py-0.5 text-[9px] font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                                                        <ImageIcon className="h-2.5 w-2.5" />
                                                        图像视觉
                                                    </span>
                                                )}
                                                {model.max_tokens && (
                                                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-mono text-gray-600 dark:bg-slate-800 dark:text-gray-400">
                                                        上下文 {(model.max_tokens / 1000).toFixed(0)}k
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 底部 */}
                <div className="flex items-center justify-between border-t border-gray-100 p-4 text-xs dark:border-slate-800">
                    {onOpenPricingModal && (
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onOpenPricingModal();
                            }}
                            className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                        >
                            <Coins className="h-3.5 w-3.5" />
                            <span>{t('custom_pricing.quick_pricing_link', '配置该模型计价单价…')}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-auto rounded-xl bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        {t('common.close', '关闭')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
