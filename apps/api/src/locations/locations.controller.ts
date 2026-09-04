import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { LocationsService } from "./locations.service";
import { CreateFolderDto, CreateLocationDto, CreateSpotDto } from "./dto/locations.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/strategies/jwt.strategy";

@UseGuards(JwtAuthGuard)
@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get("locations")
  list(@CurrentUser() user: JwtPayload) {
    return this.locations.list(user.accountId);
  }

  @Post("locations")
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateLocationDto) {
    return this.locations.create(user.accountId, body);
  }

  @Get("locations/:locationId/folders")
  listFolders(@CurrentUser() user: JwtPayload, @Param("locationId", ParseUUIDPipe) locationId: string) {
    return this.locations.listFolders(user.accountId, locationId);
  }

  @Post("folders")
  createFolder(@CurrentUser() user: JwtPayload, @Body() body: CreateFolderDto) {
    return this.locations.createFolder(user.accountId, body);
  }

  @Get("locations/:locationId/spots")
  listSpots(@CurrentUser() user: JwtPayload, @Param("locationId", ParseUUIDPipe) locationId: string) {
    return this.locations.listSpots(user.accountId, locationId);
  }

  @Post("spots")
  createSpot(@CurrentUser() user: JwtPayload, @Body() body: CreateSpotDto) {
    return this.locations.createSpot(user.accountId, body);
  }

  @Get("spots/:id")
  getSpot(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.locations.getSpot(user.accountId, id);
  }
}
