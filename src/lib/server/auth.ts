import type { Cookies } from '@sveltejs/kit';

const SESSION_COOKIE = '__session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const ALLOWED_EMAILS = [
	'stevebaigame@gmail.com'
];

type Session = {
	email: string;
	name: string;
	picture: string;
	exp: number;
};

export function isAllowedEmail(email: string): boolean {
	const allowedEnv = getEnvAllowedEmails();
	const allowed = allowedEnv.length > 0 ? allowedEnv : ALLOWED_EMAILS;
	return allowed.some((e) => e.toLowerCase() === email.toLowerCase());
}

let _envAllowedEmails: string[] | null = null;

export function setEnvAllowedEmails(raw?: string) {
	_envAllowedEmails = raw
		? raw
				.split(',')
				.map((e) => e.trim())
				.filter(Boolean)
		: null;
}

function getEnvAllowedEmails(): string[] {
	return _envAllowedEmails ?? [];
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify'
	]);
}

function toBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): ArrayBuffer {
	const padded = str.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer as ArrayBuffer;
}

async function signPayload(payload: Session, secret: string): Promise<string> {
	const key = await getSigningKey(secret);
	const encoder = new TextEncoder();
	const data = encoder.encode(JSON.stringify(payload));
	const signature = await crypto.subtle.sign('HMAC', key, data);
	return toBase64Url(data.buffer as ArrayBuffer) + '.' + toBase64Url(signature);
}

async function verifyPayload(token: string, secret: string): Promise<Session | null> {
	const parts = token.split('.');
	if (parts.length !== 2) return null;

	const key = await getSigningKey(secret);
	const data = fromBase64Url(parts[0]);
	const signature = fromBase64Url(parts[1]);

	const valid = await crypto.subtle.verify('HMAC', key, signature, new Uint8Array(data));
	if (!valid) return null;

	const session: Session = JSON.parse(new TextDecoder().decode(new Uint8Array(data)));
	if (session.exp < Date.now() / 1000) return null;

	return session;
}

export async function createSessionCookie(
	cookies: Cookies,
	user: { email: string; name: string; picture: string },
	secret: string
) {
	const session: Session = {
		email: user.email,
		name: user.name,
		picture: user.picture,
		exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
	};
	const token = await signPayload(session, secret);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: SESSION_MAX_AGE
	});
}

export async function getSession(cookies: Cookies, secret: string): Promise<Session | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	return verifyPayload(token, secret);
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function getGoogleAuthUrl(clientId: string, redirectUri: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		access_type: 'online',
		prompt: 'select_account'
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForUser(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<{ email: string; name: string; picture: string } | null> {
	const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!tokenRes.ok) return null;
	const tokens = (await tokenRes.json()) as { access_token: string };

	const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: { Authorization: `Bearer ${tokens.access_token}` }
	});

	if (!userRes.ok) return null;
	const user = (await userRes.json()) as { email: string; name: string; picture: string };
	return { email: user.email, name: user.name, picture: user.picture };
}
