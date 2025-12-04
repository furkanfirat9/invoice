import { Session } from "next-auth";

export const ELIF_EMAIL = "elifirat009@outlook.com";

export function isElif(email?: string | null): boolean {
    if (!email) return false;
    return email.toLowerCase() === ELIF_EMAIL.toLowerCase();
}

export function isSuperAdmin(session: Session | null): boolean {
    if (!session?.user?.email) return false;
    return isElif(session.user.email);
}
