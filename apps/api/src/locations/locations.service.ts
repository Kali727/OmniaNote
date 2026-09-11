import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { isWithinFolderLimit, isWithinLocationLimit, isWithinSpotLimit } from "@omnianote/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFolderInput, CreateLocationInput, CreateSpotInput } from "@omnianote/shared";

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    return this.prisma.location.findMany({ where: { accountId }, orderBy: { createdAt: "asc" } });
  }

  async create(accountId: string, input: CreateLocationInput) {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const currentCount = await this.prisma.location.count({ where: { accountId } });
    if (!isWithinLocationLimit(account.tier, currentCount)) {
      throw new ForbiddenException(
        `Your ${account.tier} plan allows a limited number of locations — upgrade to add another.`,
      );
    }
    return this.prisma.location.create({ data: { accountId, name: input.name, address: input.address } });
  }

  async listFolders(accountId: string, locationId: string) {
    await this.assertLocationOwnership(accountId, locationId);
    return this.prisma.folder.findMany({ where: { locationId }, orderBy: { createdAt: "asc" } });
  }

  async createFolder(accountId: string, input: CreateFolderInput) {
    await this.assertLocationOwnership(accountId, input.locationId);
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    // Counts every folder at this location regardless of nesting depth — a folder still
    // carries its location's id at every level, so this can't be dodged by nesting.
    const currentCount = await this.prisma.folder.count({ where: { locationId: input.locationId } });
    if (!isWithinFolderLimit(account.tier, currentCount)) {
      throw new ForbiddenException(
        `Your ${account.tier} plan allows a limited number of folders per location — upgrade to add more.`,
      );
    }
    return this.prisma.folder.create({
      data: { locationId: input.locationId, parentFolderId: input.parentFolderId, name: input.name },
    });
  }

  async listSpots(accountId: string, locationId: string) {
    await this.assertLocationOwnership(accountId, locationId);
    return this.prisma.spot.findMany({ where: { locationId }, orderBy: { name: "asc" } });
  }

  async createSpot(accountId: string, input: CreateSpotInput) {
    await this.assertLocationOwnership(accountId, input.locationId);
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const currentCount = await this.prisma.spot.count({ where: { locationId: input.locationId } });
    if (!isWithinSpotLimit(account.tier, currentCount)) {
      throw new ForbiddenException(
        `Your ${account.tier} plan allows a limited number of spots per location — upgrade to add more.`,
      );
    }
    return this.prisma.spot.create({ data: { locationId: input.locationId, name: input.name } });
  }

  async getSpot(accountId: string, spotId: string) {
    const spot = await this.prisma.spot.findUnique({ where: { id: spotId } });
    if (!spot) throw new NotFoundException("Spot not found");
    await this.assertLocationOwnership(accountId, spot.locationId);
    return spot;
  }

  /** Every write in this module must confirm the location actually belongs to the caller's account. */
  private async assertLocationOwnership(accountId: string, locationId: string): Promise<void> {
    const location = await this.prisma.location.findUnique({ where: { id: locationId }, select: { accountId: true } });
    if (!location) throw new NotFoundException("Location not found");
    if (location.accountId !== accountId) throw new ForbiddenException("Location does not belong to this account");
  }
}
