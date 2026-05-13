import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FolderPickerButton } from "./FolderPickerButton";

export function AddProjectForm() {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.addProject(path, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setPath("");
      setName("");
      setErrorMsg(null);
      setSuccessVisible(true);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setErrorMsg(err.detail);
      } else {
        setErrorMsg("Unexpected error. Please try again.");
      }
    },
  });

  useEffect(() => {
    if (!successVisible) return;
    const timer = setTimeout(() => setSuccessVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [successVisible]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessVisible(false);
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <Label htmlFor="add-path">Path</Label>
          <div className="flex gap-2">
            <Input
              id="add-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/Code/my-repo"
              required
            />
            <FolderPickerButton
              onSelect={(p) => {
                setPath(p);
                if (!name) {
                  const leaf = p.split("/").filter(Boolean).pop() ?? "";
                  setName(leaf);
                }
              }}
              title="Choose project folder"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
          <Label htmlFor="add-name">Display name</Label>
          <Input
            id="add-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-repo"
            required
          />
        </div>
        <Button
          type="submit"
          disabled={mutation.isPending || !path.trim() || !name.trim()}
          className="shrink-0"
        >
          {mutation.isPending ? "Adding…" : "Add"}
        </Button>
      </div>

      {errorMsg && (
        <p className="mt-2 text-sm text-destructive">{errorMsg}</p>
      )}
      {successVisible && (
        <p className="mt-2 text-sm text-emerald-500">
          Project added successfully.
        </p>
      )}
    </form>
  );
}
