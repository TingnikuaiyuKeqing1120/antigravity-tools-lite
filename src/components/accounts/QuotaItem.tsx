
import { Clock, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';
import { getQuotaColor, formatTimeRemaining } from '../../utils/format';

interface QuotaItemProps {
    label: React.ReactNode;
    title?: string;
    percentage: number;
    resetTime?: string;
    isProtected?: boolean;
    isAvailable?: boolean;
    className?: string;
    Icon?: React.ComponentType<{ size?: number; className?: string }>;
}

export function QuotaItem({ label, title, percentage, resetTime, isProtected, isAvailable = true, className, Icon }: QuotaItemProps) {
    const { t } = useTranslation();
    const getBgColorClass = (p: number) => {
        if (!isAvailable) return 'bg-transparent';
        const color = getQuotaColor(p);
        switch (color) {
            case 'success': return 'bg-emerald-500';
            case 'warning': return 'bg-amber-500';
            case 'error': return 'bg-rose-500';
            default: return 'bg-gray-500';
        }
    };

    const getTextColorClass = (p: number) => {
        if (!isAvailable) return 'text-gray-400 dark:text-gray-600';
        const color = getQuotaColor(p);
        switch (color) {
            case 'success': return 'text-emerald-600 dark:text-emerald-400';
            case 'warning': return 'text-amber-600 dark:text-amber-400';
            case 'error': return 'text-rose-600 dark:text-rose-400';
            default: return 'text-gray-500';
        }
    };

    return (
        <div className={cn(
            "relative h-[22px] flex items-center px-1.5 rounded-md overflow-hidden border border-gray-100/50 dark:border-white/5 bg-gray-50/30 dark:bg-white/5 group/quota",
            !isAvailable && "opacity-60",
            className
        )}
            title={title || (typeof label === 'string' ? label : undefined)}
        >
            {/* Background Progress Bar */}
            {isAvailable && (
                <div
                    className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-700 ease-out opacity-15 dark:opacity-20",
                        getBgColorClass(percentage)
                    )}
                    style={{ width: `${percentage}%` }}
                />
            )}

            {/* Content */}
            <div className="relative z-10 w-full flex items-center text-[10px] font-mono leading-none gap-1.5">
                {/* Model Name */}
                <span className={cn(
                    "flex-1 min-w-0 text-gray-500 dark:text-gray-400 font-bold truncate text-left flex items-center gap-1",
                    !isAvailable && "line-through decoration-gray-300 dark:decoration-gray-700"
                )} title={title || (typeof label === 'string' ? label : undefined)}>
                    {Icon && <Icon size={12} className="shrink-0" />}
                    {label}
                </span>

                {/* Reset Time */}
                <div className="w-[58px] flex justify-start shrink-0">
                    {!isAvailable ? (
                        <span className="text-gray-300 dark:text-gray-600 scale-90">-</span>
                    ) : resetTime ? (
                        <span className="flex items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400 truncate">
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            {formatTimeRemaining(resetTime)}
                        </span>
                    ) : (
                        <span className="text-gray-300 dark:text-gray-600 italic scale-90">N/A</span>
                    )}
                </div>

                {/* Percentage */}
                <span className={cn(
                    "text-right font-bold transition-colors flex items-center justify-end gap-0.5 shrink-0",
                    isAvailable ? "w-[28px]" : "w-[36px] text-[9px] font-normal",
                    getTextColorClass(percentage)
                )}>
                    {isProtected && isAvailable && (
                        <span title={t('accounts.quota_protected')}><Lock className="w-2.5 h-2.5 text-amber-500" /></span>
                    )}
                    {isAvailable ? `${percentage}%` : t('account_models.not_available', '未开通')}
                </span>
            </div>
        </div>
    );
}
