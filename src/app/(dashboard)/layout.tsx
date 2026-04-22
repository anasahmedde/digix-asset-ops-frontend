"use client";

import { AuthGuard } from "@/components/layout/auth-guard";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { UserProvider } from "@/lib/user-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <UserProvider>
        <div className="min-h-screen bg-background">
          <Sidebar />
          <div className="pl-64">
            <Header />
            <main className="p-6">{children}</main>
          </div>
        </div>
      </UserProvider>
    </AuthGuard>
  );
}
