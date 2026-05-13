import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onSelect: (path: string) => void;
  defaultPath?: string;
  title?: string;
}

export function FolderPickerButton({ onSelect, defaultPath, title = "Choose folder" }: Props) {
  async function handle() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
      });
      if (typeof selected === "string" && selected.length > 0) {
        onSelect(selected);
      }
    } catch {
      // user cancel or dialog plugin unavailable — silently ignore
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handle}
      title={title}
      className="shrink-0"
    >
      <FolderOpen size={16} strokeWidth={1.75} />
    </Button>
  );
}
