import type { Env } from '$lib/server/types';

declare global {
  const __APP_VERSION__: string;

  namespace App {
    interface Locals {
      user?: {
        id: string;
        email: string;
        name: string;
        picture: string;
        isAdmin: boolean;
      };
    }
    interface Platform {
      env: Env;
    }
  }
}

export {};
