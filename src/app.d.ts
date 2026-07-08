import type { Env } from '$lib/server/types';

declare const __APP_VERSION__: string;

declare global {
  namespace App {
    interface Locals {
      user?: {
        email: string;
        name: string;
        picture: string;
      };
    }
    interface Platform {
      env: Env;
    }
  }
}

export {};
