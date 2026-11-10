"use client";
import { createContext, useContext } from "react";
export type Workspace = {
  role: string | null;
  userId: string;
  garage: boolean;
  franchiseId: string | null;
};
export const WorkspaceContext = createContext<Workspace>({
  role: null,
  userId: "",
  garage: false,
  franchiseId: null,
});
export function useWorkspace() {
  return useContext(WorkspaceContext);
}
