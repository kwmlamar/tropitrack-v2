"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowRight,
  Clock,
  FileText,
  DollarSign,
  Package,
  Users,
  BarChart3,
  Search,
  Wrench,
  Loader2,
  Send,
  Sparkles,
  ArrowLeft,
  X,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface QuickAction {
  icon: React.ReactNode;
  title: string;
  description: string;
  prompt: string;
  href?: string;
}

const quickActions: QuickAction[] = [
  {
    icon: <Clock className="h-6 w-6" />,
    title: "Enter worker time",
    description: "Quick time entry for today",
    prompt: "Help me enter time for workers today",
    href: "/time-tracking/quick",
  },
  {
    icon: <FileText className="h-6 w-6" />,
    title: "Create estimate",
    description: "Generate project estimate with AI",
    prompt: "Help me create a new project estimate",
    href: "/estimates/new",
  },
  {
    icon: <DollarSign className="h-6 w-6" />,
    title: "Create invoice",
    description: "Invoice a project milestone",
    prompt: "Help me create an invoice for a project",
    href: "/invoices/new",
  },
  {
    icon: <Search className="h-6 w-6" />,
    title: "Find project costs",
    description: "Search and analyze spending",
    prompt: "Show me the costs breakdown for my projects",
  },
  {
    icon: <Package className="h-6 w-6" />,
    title: "Track materials",
    description: "Log materials received today",
    prompt: "Help me log materials received today",
    href: "/materials",
  },
  {
    icon: <Users className="h-6 w-6" />,
    title: "Show payroll",
    description: "View this week's payroll summary",
    prompt: "Show me this week's payroll summary",
    href: "/payroll",
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: "Project profitability",
    description: "Analyze profit margins",
    prompt: "Analyze the profitability of my active projects",
  },
  {
    icon: <Wrench className="h-6 w-6" />,
    title: "Search projects",
    description: "Find projects by name or status",
    prompt: "Help me find a project",
    href: "/projects",
  },
];

export default function AssistantPage() {
  const router = useRouter();
  const { session } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsChatMode(true);
    setIsLoading(true);

    try {
      // Call AI search API
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ query: userMessage.content }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.summary || data.answer || "I found some results for your query. Please check the search results above.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.href) {
      router.push(action.href);
    } else {
      setQuery(action.prompt);
      inputRef.current?.focus();
    }
  };

  const resetChat = () => {
    setMessages([]);
    setIsChatMode(false);
    setQuery("");
  };

  if (isChatMode) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        {/* Chat Header */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={resetChat}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <span className="font-semibold">TropiTrack AI</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={resetChat}>
              New Chat
            </Button>
          </div>
        </header>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {/* Chat Input */}
        <div className="sticky bottom-0 border-t bg-background p-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="relative">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type your message..."
                className="pr-12 py-6 text-base rounded-xl"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!query.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="AI Assistant" description="Your intelligent construction companion" />

      <div className="flex-1 flex flex-col">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          {/* Logo/Icon */}
          <div className="mb-8">
            <div className="p-4 rounded-2xl bg-primary/10 inline-block">
              <Wrench className="h-12 w-12 text-primary" />
            </div>
          </div>

          {/* Greeting */}
          <h1 className="text-3xl md:text-4xl font-bold text-center mb-8">
            What can I help you build today?
          </h1>

          {/* Search Input */}
          <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-12">
            <div className="relative">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask me anything..."
                className="w-full px-6 py-6 text-lg rounded-xl border-2 focus:border-primary pr-14"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!query.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-lg"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </form>

          {/* Quick Actions */}
          <div className="w-full max-w-4xl">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-6 text-center">
              Get started
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action)}
                  className="group p-5 rounded-xl border border-border bg-card hover:border-primary hover:shadow-lg transition-all text-left"
                >
                  <div className="mb-3 text-primary group-hover:scale-110 transition-transform">
                    {action.icon}
                  </div>
                  <h3 className="font-semibold mb-1">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="text-center pb-6">
          <p className="text-sm text-muted-foreground">
            Press <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">⌘K</kbd> anywhere to open search
          </p>
        </div>
      </div>
    </div>
  );
}
