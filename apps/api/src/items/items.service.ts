import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateItemInput, FileItemInput, isWithinStorageLimit, ItemType } from "@omnianote/shared";
import { Item } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { SearchService } from "../search/search.service";

const MEDIA_TYPES: ItemType[] = [ItemType.PHOTO, ItemType.VIDEO, ItemType.PDF];
// Only photos get a client-generated thumbnail for now — extracting a video frame or
// rendering a PDF page needs a real server-side pipeline (BullMQ isn't wired up yet).
const THUMBNAIL_TYPES: ItemType[] = [ItemType.PHOTO];

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly searchService: SearchService,
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
    const thumbnailKey = THUMBNAIL_TYPES.includes(input.type)
      ? this.storage.buildObjectKey(accountId, "thumbnail", "jpg")
      : null;

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
        thumbnailKey,
        clientCreatedAt: new Date(input.clientCreatedAt),
      },
    });

    await this.searchService.indexItem(item);

    const uploadUrl = storageKey ? await this.storage.getUploadUrl(storageKey, `application/octet-stream`) : null;
    const thumbnailUploadUrl = thumbnailKey ? await this.storage.getUploadUrl(thumbnailKey, "image/jpeg") : null;
    return { item, uploadUrl, thumbnailUploadUrl };
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
      await this.searchService.removeItem(itemId);
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
    const thumbnailUrl = item.thumbnailKey ? await this.storage.getDownloadUrl(item.thumbnailKey) : null;
    return { item, downloadUrl, thumbnailUrl };
  }

  async listInbox(accountId: string) {
    return this.withThumbnailUrls(
      await this.prisma.item.findMany({
        where: { accountId, locationId: null },
        orderBy: { clientCreatedAt: "desc" },
      }),
    );
  }

  async listRecent(accountId: string, limit = 20) {
    return this.withThumbnailUrls(
      await this.prisma.item.findMany({ where: { accountId }, orderBy: { clientCreatedAt: "desc" }, take: limit }),
    );
  }

  async listFavorites(accountId: string) {
    return this.withThumbnailUrls(
      await this.prisma.item.findMany({
        where: { accountId, isFavorite: true },
        orderBy: { clientCreatedAt: "desc" },
      }),
    );
  }

  async listByFolder(accountId: string, locationId: string, folderId: string | null) {
    return this.withThumbnailUrls(
      await this.prisma.item.findMany({
        where: { accountId, locationId, folderId },
        orderBy: { clientCreatedAt: "desc" },
      }),
    );
  }

  async listBySpot(accountId: string, spotId: string) {
    return this.withThumbnailUrls(
      await this.prisma.item.findMany({ where: { accountId, spotId }, orderBy: { clientCreatedAt: "desc" } }),
    );
  }

  /** Files (or re-files) an item from the Inbox into a location/folder/spot. */
  async file(accountId: string, itemId: string, input: FileItemInput) {
    await this.getOwnedItem(accountId, itemId);
    const location = await this.prisma.location.findUnique({ where: { id: input.locationId } });
    if (!location || location.accountId !== accountId) {
      throw new ForbiddenException("Location does not belong to this account");
    }
    const updated = await this.prisma.item.update({
      where: { id: itemId },
      data: { locationId: input.locationId, folderId: input.folderId, spotId: input.spotId },
    });
    await this.searchService.indexItem(updated);
    return updated;
  }

  async toggleFavorite(accountId: string, itemId: string) {
    const item = await this.getOwnedItem(accountId, itemId);
    const updated = await this.prisma.item.update({
      where: { id: itemId },
      data: { isFavorite: !item.isFavorite },
    });
    await this.searchService.indexItem(updated);
    return updated;
  }

  async search(accountId: string, query: string, locationId?: string) {
    const ids = await this.searchService.search(accountId, query, locationId);
    if (ids.length === 0) return [];
    const items = await this.prisma.item.findMany({ where: { id: { in: ids }, accountId } });
    const byId = new Map(items.map((item) => [item.id, item]));
    const ordered = ids.map((id) => byId.get(id)).filter((item): item is Item => item !== undefined);
    return this.withThumbnailUrls(ordered);
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

  /** Attaches a presigned thumbnailUrl to each item that has a thumbnailKey — grid views
   *  need something to put in an <img src> without a separate round trip per tile. */
  private async withThumbnailUrls(items: Item[]) {
    return Promise.all(
      items.map(async (item) => ({
        ...item,
        thumbnailUrl: item.thumbnailKey ? await this.storage.getDownloadUrl(item.thumbnailKey) : null,
      })),
    );
  }

  private async getOwnedItem(accountId: string, itemId: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Item not found");
    if (item.accountId !== accountId) throw new ForbiddenException("Item does not belong to this account");
    return item;
  }
}
