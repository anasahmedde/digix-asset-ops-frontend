"use client";

import { AuthGuard } from "@/components/layout/auth-guard";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { ChatUnreadProvider } from "@/lib/chat-context";
import { NotificationProvider } from "@/lib/notification-context";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { UserProvider } from "@/lib/user-context";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed, mobileOpen, closeMobile } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* Mobile backdrop when the drawer is open */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden
        />
      )}
      <div
        className="transition-all duration-200 lg:pl-[var(--sidebar-w)]"
        style={{ ["--sidebar-w" as string]: collapsed ? "72px" : "256px" }}
      >
        <Header />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <UserProvider>
        <SidebarProvider>
          <NotificationProvider>
            <ChatUnreadProvider>
              <DashboardShell>{children}</DashboardShell>
            </ChatUnreadProvider>
          </NotificationProvider>
        </SidebarProvider>
      </UserProvider>
    </AuthGuard>
  );
}
