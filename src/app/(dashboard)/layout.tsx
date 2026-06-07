"use client";

import { AuthGuard } from "@/components/layout/auth-guard";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { ChatUnreadProvider } from "@/lib/chat-context";
import { NotificationProvider } from "@/lib/notification-context";
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context";
import { UserProvider } from "@/lib/user-context";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className="transition-all duration-200"
        style={{ paddingLeft: collapsed ? "72px" : "256px" }}
      >
        <Header />
        <main className="p-6">{children}</main>
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
