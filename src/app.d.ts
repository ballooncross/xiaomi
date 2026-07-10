import type { Env } from '$lib/server/types';

declare global {
  const __APP_VERSION__: string;

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
