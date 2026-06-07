declare module 'vanillajs-datepicker/Datepicker' {
  export default class Datepicker {
    constructor(element: HTMLElement, options?: Record<string, unknown>);
    destroy(): void;
  }
}

declare module 'vanillajs-datepicker/css/datepicker.css';
