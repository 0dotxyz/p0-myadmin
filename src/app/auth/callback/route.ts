import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Allowed email domains for authentication
 * Only mrgn.group and 0.xyz employees can sign in
 */
const ALLOWED_DOMAINS = ["mrgn.group", "0.xyz"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`);
  }

  // Create response for redirecting to home (we'll update cookies on it)
  const response = NextResponse.redirect(`${origin}/`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookieStore = request.headers.get("cookie") || "";
          return cookieStore
            .split(";")
            .filter((c) => c.trim())
            .map((c) => {
              const idx = c.indexOf("=");
              const name = c.substring(0, idx).trim();
              const value = c.substring(idx + 1);
              return { name, value };
            });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Exchange the code for a session
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("Auth exchange error:", exchangeError);
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  // Get the user to check their email domain
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Failed to get user:", userError);
    return NextResponse.redirect(`${origin}/?error=user_fetch_failed`);
  }

  // Validate email domain
  const email = user.email || "";
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
    console.warn(`Unauthorized domain attempt: ${email}`);
    
    // Sign out the user - they're not allowed
    await supabase.auth.signOut();
    
    // Clear all Supabase auth cookies (they use dynamic names like sb-<project-ref>-auth-token)
    response.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    });
    
    return NextResponse.redirect(`${origin}/?error=unauthorized_domain`);
  }

  // Success! User is authenticated and has valid domain
  console.log(`User authenticated: ${email}`);
  return response;
}
