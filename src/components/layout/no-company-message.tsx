"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, AlertCircle } from "lucide-react";

export function NoCompanyMessage() {
  return (
    <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/50">
            <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2">Company Setup Required</h3>
            <p className="text-muted-foreground mb-4">
              You need to join or create a company to use TropiTrack. You can either join an existing company with a join code or create a new company.
            </p>
            <div className="flex gap-3">
              <Link href="/settings">
                <Button>
                  <Building2 className="h-4 w-4 mr-2" />
                  Go to Settings
                </Button>
              </Link>
              <Link href="/login?code=">
                <Button variant="outline">
                  Join with Code
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
