import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { IconDownload, IconFileTypeCsv, IconJson } from "@tabler/icons-react";
import { downloadLeadsCsv, downloadLeadsJson } from "@/lib/export";
import type { LeadWithScore } from "@/lib/tauri/types";
import { toast } from "sonner";

interface ExportLeadsButtonProps {
  leads: LeadWithScore[];
}

export function ExportLeadsButton({ leads }: ExportLeadsButtonProps) {
  const disabled = leads.length === 0;

  const handleCsv = () => {
    downloadLeadsCsv(leads);
    toast.success(`Downloaded ${leads.length} lead${leads.length === 1 ? "" : "s"} as CSV`);
  };

  const handleJson = () => {
    downloadLeadsJson(leads);
    toast.success(`Downloaded ${leads.length} lead${leads.length === 1 ? "" : "s"} as JSON`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <IconDownload className="size-3.5" />
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleCsv}>
          <IconFileTypeCsv className="size-3.5" />
          Download as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleJson}>
          <IconJson className="size-3.5" />
          Download as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
