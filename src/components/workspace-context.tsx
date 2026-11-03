"use client";
import { createContext, useContext } from "react";
export type Workspace = {
  role: string | null;
  userId: string;
  garage: boolean;
};
export const WorkspaceContext = createContext<Workspace>({
  role: null,
  userId: "",
  garage: false,
});
export function useWorkspace() {
  return useContext(WorkspaceContext);
}
