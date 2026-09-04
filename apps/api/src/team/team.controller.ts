import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { TeamService } from "./team.service";
import { AcceptInviteDto, InviteTeammateDto, UpdateAccountNameDto, UpdateMemberRoleDto } from "./dto/team.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/strategies/jwt.strategy";

@Controller("team")
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @UseGuards(JwtAuthGuard)
  @Get("members")
  listMembers(@CurrentUser() user: JwtPayload) {
    return this.team.listMembers(user.accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("account-name")
  updateAccountName(@CurrentUser() user: JwtPayload, @Body() body: UpdateAccountNameDto) {
    return this.team.updateAccountName(user.accountId, user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("invites")
  inviteTeammate(@CurrentUser() user: JwtPayload, @Body() body: InviteTeammateDto) {
    return this.team.inviteTeammate(user.accountId, user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("invites/:id")
  async revokeInvite(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.team.revokeInvite(user.accountId, user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("members/:userId")
  async removeMember(@CurrentUser() user: JwtPayload, @Param("userId") userId: string) {
    await this.team.removeMember(user.accountId, user.sub, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("members/:userId/role")
  updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param("userId") userId: string,
    @Body() body: UpdateMemberRoleDto,
  ) {
    return this.team.updateMemberRole(user.accountId, user.sub, userId, body.role);
  }

  // Public — the invitee has no account yet, so there's nothing to authenticate.
  @Get("invites/:token")
  previewInvite(@Param("token") token: string) {
    return this.team.previewInvite(token);
  }

  @HttpCode(HttpStatus.OK)
  @Post("invites/:token/accept")
  acceptInvite(@Param("token") token: string, @Body() body: AcceptInviteDto) {
    return this.team.acceptInvite(token, body);
  }
}
