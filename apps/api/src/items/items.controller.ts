import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ItemsService } from "./items.service";
import { AttachToNoteDto, ConfirmUploadDto, CreateItemDto, FileItemDto } from "./dto/items.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/strategies/jwt.strategy";

@UseGuards(JwtAuthGuard)
@Controller("items")
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateItemDto) {
    return this.items.create(user.accountId, user.sub, body);
  }

  @Post(":id/uploaded")
  confirmUpload(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ConfirmUploadDto,
  ) {
    return this.items.confirmUpload(user.accountId, id, body.storageBytes, body.mimeType);
  }

  @Get("inbox")
  inbox(@CurrentUser() user: JwtPayload) {
    return this.items.listInbox(user.accountId);
  }

  @Get("recent")
  recent(@CurrentUser() user: JwtPayload) {
    return this.items.listRecent(user.accountId);
  }

  @Get("favorites")
  favorites(@CurrentUser() user: JwtPayload) {
    return this.items.listFavorites(user.accountId);
  }

  @Get("by-folder")
  byFolder(
    @CurrentUser() user: JwtPayload,
    @Query("locationId", ParseUUIDPipe) locationId: string,
    @Query("folderId") folderId?: string,
  ) {
    return this.items.listByFolder(user.accountId, locationId, folderId ?? null);
  }

  @Get("by-spot/:spotId")
  bySpot(@CurrentUser() user: JwtPayload, @Param("spotId", ParseUUIDPipe) spotId: string) {
    return this.items.listBySpot(user.accountId, spotId);
  }

  @Get("search")
  search(@CurrentUser() user: JwtPayload, @Query("q") q: string, @Query("locationId") locationId?: string) {
    return this.items.search(user.accountId, q ?? "", locationId);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.items.get(user.accountId, id);
  }

  @Patch(":id/file")
  file(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string, @Body() body: FileItemDto) {
    return this.items.file(user.accountId, id, body);
  }

  @Patch(":id/favorite")
  toggleFavorite(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.items.toggleFavorite(user.accountId, id);
  }

  @Post("attach")
  attach(@CurrentUser() user: JwtPayload, @Body() body: AttachToNoteDto) {
    return this.items.attachToNote(user.accountId, body.noteItemId, body.attachmentItemId);
  }
}
