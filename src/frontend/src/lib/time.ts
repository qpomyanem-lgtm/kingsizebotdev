/**
 * Утилита для форматирования дат по московскому времени (UTC+3).
 * ПРАВИЛО ПРОЕКТА: все даты на сайте — всегда по Москве.
 */

const MOSCOW_TZ = 'Europe/Moscow';

/**
 * Форматирует дату в московском часовом поясе.
 * @param date - строка ISO или объект Date
 * @param options - опции Intl.DateTimeFormat (по умолчанию: дата + время)
 */
export function formatMoscowDate(
    date: string | Date,
    options?: Intl.DateTimeFormatOptions
): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const defaultOptions: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MOSCOW_TZ,
    };
    return new Intl.DateTimeFormat('ru-RU', options ?? defaultOptions).format(d);
}
