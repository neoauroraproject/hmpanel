import {
  formatCompactRevenue,
  formatMonthTable,
  renderYearlyRevenueChartPng,
} from './revenue-chart-png';

describe('yearly revenue chart', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    toman: i === 0 ? 1_000_000 : 0,
    usd: i === 1 ? 50 : 0,
    orders: i < 2 ? 1 : 0,
  }));

  it('renders a PNG data URL', () => {
    const png = renderYearlyRevenueChartPng({
      year: 2026,
      months,
      preferToman: true,
    });
    expect(png.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(png.split(',')[1], 'base64').subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('prints gregorian month rows with the primary currency', () => {
    const table = formatMonthTable(
      months,
      (n, c) => (c === 'toman' ? `${n}T` : `$${n}`),
      true,
    );
    expect(table).toContain('ژان: 1000000T (1)');
    expect(table).toContain('فور: 0T · $50 (1)');
    expect(table.split('\n')).toHaveLength(12);
  });

  it('formats compact revenue labels for the PNG glyphs', () => {
    expect(formatCompactRevenue(12)).toBe('12');
    expect(formatCompactRevenue(850_000)).toBe('850K');
    expect(formatCompactRevenue(1_200_000)).toBe('1.2M');
    expect(formatCompactRevenue(1_000_000)).toBe('1M');
  });
});
