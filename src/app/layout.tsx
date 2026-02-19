import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import {
  Activity,
  Database,
  FileStack,
  ListTodo,
  Settings2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import "./globals.css";

const ibmSans = IBM_Plex_Sans({
  variable: "--font-ibm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "AgentMesh",
  description: "Control layer for AI sessions",
};

const NAV_ITEMS = [
  { href: "/sessions", label: "Sessions", icon: FileStack },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/prompts", label: "Prompts", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${ibmSans.variable} ${ibmMono.variable} antialiased`}>
        <SidebarProvider>
          <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
              <div className="px-2 py-1.5">
                <p className="text-sm font-semibold tracking-tight">
                  AgentMesh
                </p>
                <p className="text-muted-foreground text-xs">
                  Local AI session graph
                </p>
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {NAV_ITEMS.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild tooltip={item.label}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <p className="text-muted-foreground px-2 pb-2 text-xs">
                Local-first and reproducible
              </p>
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <header className="border-border/70 bg-background/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
              <SidebarTrigger />
              <div className="text-sm font-medium">Unified AI Operations</div>
            </header>
            <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
