"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";
import { PROGRAMS, type ProgramId } from "@/lib/config";

interface ProgramSwitcherProps {
  currentProgram: ProgramId;
  onProgramChange: (programId: ProgramId) => void;
}

export function ProgramSwitcher({
  currentProgram,
  onProgramChange,
}: ProgramSwitcherProps) {
  const currentProgramConfig = PROGRAMS[currentProgram];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          {currentProgramConfig.name}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.entries(PROGRAMS).map(([id, config]) => (
          <DropdownMenuItem
            key={id}
            onClick={() => onProgramChange(id as ProgramId)}
            className="flex items-center justify-between"
          >
            <span>{config.name}</span>
            {id === currentProgram && <Check className="h-4 w-4 ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
