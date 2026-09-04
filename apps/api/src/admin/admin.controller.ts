import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseLimit(raw?: string): number {
  const parsed = raw ? Number(raw) : DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  getOverview() {
    return this.admin.getOverview();
  }

  @Get("errors")
  listErrors(@Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.admin.listErrors(parseLimit(limit), cursor);
  }

  @Get("accounts")
  listAccounts(@Query("limit") limit?: string, @Query("cursor") cursor?: string, @Query("search") search?: string) {
    return this.admin.listAccounts(parseLimit(limit), cursor, search);
  }

  @Get("health")
  getHealth() {
    return this.admin.getHealth();
  }
}
