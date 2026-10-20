"use client";

import { createContext } from "react";
import type { MentionTarget } from "@/lib/group-mentions";

export const GroupMentionContext = createContext<ReadonlyMap<string, MentionTarget> | null>(null);
