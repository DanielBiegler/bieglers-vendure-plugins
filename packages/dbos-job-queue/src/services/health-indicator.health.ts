import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";

@Injectable()
export class DBOSHealthIndicator { // TODO check is there really no interface to implement? huh the docs dont mention it
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
  ) { }

  async isHealthy(key: string) { // TODO why add a variable key, shouldnt we just hardcode it here
    const indicator = this.healthIndicatorService.check(key);

    try {
      // TODO make a real check
      const isHealthy = true;

      if (isHealthy) return indicator.up();
      else return indicator.down();

    } catch (error) {
      return indicator.down('Unable to check health of DBOS');
    }
  }

}