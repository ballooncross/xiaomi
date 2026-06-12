<script lang="ts">
  import '../../app.css';
  let { data } = $props();
</script>

<svelte:head>
  <title>Sign In — Personal Radar</title>
</svelte:head>

<div class="login-page">
  <div class="login-card">
    <div class="logo">📡</div>
    <h1>Personal Radar</h1>
    <p class="subtitle">Sign in to access your dashboard</p>

    {#if data.error === 'denied'}
      <div class="error-banner">
        Your account is not authorized to access this app.
      </div>
    {/if}

    {#if data.authConfigured && data.googleAuthUrl}
      <a href={data.googleAuthUrl} class="google-btn">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </a>
    {:else}
      <div class="error-banner">
        Authentication is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET environment variables.
      </div>
    {/if}
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .login-card {
    background: var(--paper);
    border-radius: 16px;
    padding: 3rem 2.5rem;
    max-width: 380px;
    width: 100%;
    text-align: center;
    box-shadow:
      0 2px 8px rgba(36, 27, 20, 0.08),
      0 1px 2px rgba(36, 27, 20, 0.06);
  }

  .logo {
    font-size: 3rem;
    margin-bottom: 0.5rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.25rem;
    color: var(--ink);
  }

  .subtitle {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0 0 2rem;
  }

  .google-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem;
    background: white;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--ink);
    text-decoration: none;
    cursor: pointer;
    transition: box-shadow 0.15s, border-color 0.15s;
  }

  .google-btn:hover {
    box-shadow: 0 2px 8px rgba(36, 27, 20, 0.12);
    border-color: rgba(36, 27, 20, 0.25);
  }

  .error-banner {
    background: #fef2f2;
    color: var(--accent);
    border: 1px solid rgba(179, 58, 43, 0.2);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    margin-bottom: 1.5rem;
  }
</style>
