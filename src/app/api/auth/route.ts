import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from "@/lib/supabaseServer"; 

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }

    // Secure server-side lookup
    const { data, error } = await supabaseServer
      .from("app_users")
      .select("username, role")
      .eq("username", username)
      .eq("password", password)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Set secure cookies
    const res = NextResponse.json({ success: true, role: data.role });

    res.cookies.set("auth_role", data.role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 86400,
    });

    res.cookies.set("admin_session", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 86400,
    });

    res.cookies.set("username", username, {
      httpOnly: false,
      path: "/",
      maxAge: 86400,
    });

    return res;

  } catch (err) {
    console.error("AUTH ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
