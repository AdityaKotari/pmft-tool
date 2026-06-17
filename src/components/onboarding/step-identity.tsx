"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StepIdentityProps {
  name: string;
  email: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onNext: () => void;
}

export function StepIdentity({
  name,
  email,
  onNameChange,
  onEmailChange,
  onNext,
}: StepIdentityProps) {
  const valid = name.trim().length > 0 && email.includes("@");

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome to Fundraises
        </h1>
        <p className="text-muted-foreground">
          Discover companies raising capital from SEC Form D filings.
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The SEC requires a name and email to access EDGAR data. This is stored
          locally in your <code className="text-xs bg-muted px-1 rounded">.env</code> file —
          we never send it anywhere.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Full Name</label>
            <Input
              className="mt-1"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              className="mt-1"
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Button className="w-full" disabled={!valid} onClick={onNext}>
        Continue
      </Button>
    </div>
  );
}
