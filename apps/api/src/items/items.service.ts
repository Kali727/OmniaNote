import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateItemInput, FileItemInput, isWithinStorageLimit, ItemType } from "@maintnote/shared";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const MEDIA_TYPES: ItemType[] = [ItemType.PHOTO, ItemType.VIDEO, ItemType.PDF];

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Creates the metadata row and, for media items, a presigned URL the client uploads
   * the original bytes to directly — the API process never sees the file body. The item
   * starts unfiled (locationId/folderId null) unless the caller already knows where it goes.
   */
  async create(accountId: string, userId: string, input: CreateItemInput) {
    const isMedia = MEDIA_TYPES.includes(input.type);
    if (isMedia && !input.fileExtension) {
      throw new BadRequestException("fileExtension is required for photo/video/pdf items");
    }

    const storageKey = isMedia ? this.storage.buildObjectKey(accountId, "original", input.fileExtension!) : null;

    const item = await this.prisma.item.create({
      data: {
        accountId,
        createdByUserId: userId,
        type: input.type,
        title: input.title,
        body: input.body,
        locationId: input.locationId,
        folderId: input.folderId,
        spotId: input.spotId,
        stamps: input.stamps ?? [],
        storageKey,
        clientCreatedAt: new Date(input.clientCreatedAt),
      },
    });

    const uploadUrl = storageKey ? await this.storage.getUploadUrl(storageKey, `application/octet-stream`) : null;
    return { item, uploadUrl };
  }

  /** Called once the client has PUT the file to `uploadUrl` — now we know the real size. */
  async confirmUpload(accountId: string, itemId: string, storageBytes: number, mimeType: string) {
    const item = await this.getOwnedItem(accountId, itemId);
    if (!item.storageKey) {
      throw new BadRequestException("This item has no associated file upload");
    }

    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    if (!isWithinStorageLimit(account.tier, Number(account.storageUsedBytes), storageBytes)) {
      await this.storage.deleteObject(item.storageKey);
      await this.prisma.item.delete({ where: { id: itemId } });
      throw new ForbiddenException(`This upload would exceed your ${account.tier} plan's storage limit.`);
    }

    await this.prisma.$transaction([
      this.prisma.item.update({ where: { id: itemId }, data: { storageBytes, mimeType } }),
      this.prisma.account.update({
        where: { id: accountId },
        data: { storageUsedBytes: { increment: storageBytes } },
      }),
    ]);

    return { ok: true };
  }

  async get(accountId: string, itemId: string) {
    const item = await this.getOwnedItem(accountId, itemId);
    const downloadUrl = item.storageKey ? await this.storage.getDownloadUrl(item.storageKey) : null;
    return { item, downloadUrl };
  }

  async listInbox(accountId: string) {
    return this.prisma.item.findMany({
      where: { accountId, locationId: null },
      orderBy: { clientCreatedAt: "desc" },
    });
  }

  async listRecent(accountId: string, limit = 20) {
    return this.prisma.item.findMany({ where: { accountId }, orderBy: { clientCreatedAt: "desc" }, take: limit });
  }

  async listFavorites(accountId: string) {
    return this.prisma.item.findMany({
      where: { accountId, isFavorite: true },
      orderBy: { clientCreatedAt: "desc" },
    });
  }

  async listByFolder(accountId: string, locationId: string, folderId: string | null) {
    return this.prisma.item.findMany({
      where: { accountId, locationId, folderId },
      orderBy: { clientCreatedAt: "desc" },
    });
  }

  async listBySpot(accountId: string, spotId: string) {
    return this.prisma.item.findMany({ where: { accountId, spotId }, orderBy: { clientCreatedAt: "desc" } });
  }

  /** Files (or re-files) an item from the Inbox into a location/folder/spot. */
  async file(accountId: string, itemId: string, input: FileItemInput) {
    await this.getOwnedItem(accountId, itemId);
    const location = await this.prisma.location.findUnique({ where: { id: input.locationId } });
    if (!location || location.accountId !== accountId) {
      throw new ForbiddenException("Location does not belong to this account");
    }
    return this.prisma.item.update({
      where: { id: itemId },
      data: { locationId: input.locationId, folderId: input.folderId, spotId: input.spotId },
    });
  }

  async toggleFavorite(accountId: string, itemId: string) {
    const item = await this.getOwnedItem(accountId, itemId);
    return this.prisma.item.update({ where: { id: itemId }, data: { isFavorite: !item.isFavorite } });
  }

  async attachToNote(accountId: string, noteItemId: string, attachmentItemId: string) {
    const [note, attachment] = await Promise.all([
      this.getOwnedItem(accountId, noteItemId),
      this.getOwnedItem(accountId, attachmentItemId),
    ]);
    if (note.type !== ItemType.NOTE) {
      throw new BadRequestException("Attachments can only be added to NOTE items");
    }
    return this.prisma.noteAttachment.create({
      data: { noteItemId: note.id, attachmentItemId: attachment.id },
    });
  }

  private async getOwnedItem(accountId: string, itemId: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Item not found");
    if (item.accountId !== accountId) throw new ForbiddenException("Item does not belong to this account");
    return item;
  }
}
