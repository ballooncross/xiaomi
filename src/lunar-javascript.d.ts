declare module 'lunar-javascript' {
  export const Lunar: {
    fromYmd(year: number, month: number, day: number, hour?: number, isLeapMonth?: boolean): {
      getSolar(): { getYear(): number; getMonth(): number; getDay(): number };
    };
  };
  export const Solar: {
    fromYmd(year: number, month: number, day: number): {
      getLunar(): {
        getYear(): number;
        getMonth(): number;
        getDay(): number;
        getMonthInChinese(): string;
        getDayInChinese(): string;
      };
    };
  };
}
