import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("./wguiAuth", () => ({
  isWguiBackendConfigured: () => true,
  invokeWguiFunction: mocks.invoke
}));

import {
  loadCampaignOptions,
  loadEncounter,
  loadEncounterOptions
} from "./wgui";
import type { WguiSession } from "./wguiAuth";

const session: WguiSession = {
  accessToken: "test-access-token",
  userId: "USER-1",
  email: "test@example.invalid"
};

describe("authenticated WGUI catalog", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (name: string, body: Record<string, unknown>) => {
      if (name === "find-campaign" && body.user_id === "USER-1") {
        return [{
          id: 23,
          user_id: "user-1",
          name: "The Price of Prophecy (Production)"
        }];
      }

      if (name === "find-character" && body.user_id === "USER-1") {
        return [
          { id: 501, campaign_id: 24 },
          { id: 502, campaign_id: 24 }
        ];
      }

      if (name === "find-campaign" && body.id === 24) {
        return [{
          id: 24,
          user_id: "OTHER-GM",
          name: "A Campaign I Play In"
        }];
      }

      if (name === "wgui-ext-find-encounter" && body.campaign_id === 23 && body.id === 41) {
        return [{
          id: 41,
          campaign_id: 23,
          name: "Getting the Darkwood",
          combatants: {
            list: Array.from({ length: 13 }, (_, index) => ({
              _id: `darkwood-${index + 1}`,
              type: "CREATURE",
              ally: false,
              initiative: 20 - index,
              creature: {
                id: 1000 + index,
                name: `Darkwood Creature ${index + 1}`,
                level: 2,
                hp_current: 18,
                hp_temp: 0,
                details: { conditions: [] },
                meta_data: {
                  calculated_stats: {
                    hp_max: 24,
                    ac: 17,
                    profs: {
                      PERCEPTION: { total: 6 },
                      SAVE_FORT: { total: 7 },
                      SAVE_REFLEX: { total: 5 },
                      SAVE_WILL: { total: 4 }
                    }
                  }
                }
              }
            }))
          }
        }];
      }

      if (name === "wgui-ext-find-encounter" && body.campaign_id === 23) {
        return [
          { id: 40, campaign_id: 23, name: "wg combat test", combatants: { list: new Array(8).fill({}) } },
          { id: 41, campaign_id: 23, name: "Getting the Darkwood", combatants: { list: new Array(13).fill({}) } },
          { id: 42, campaign_id: 23, name: "test 2", combatants: { list: new Array(7).fill({}) } }
        ];
      }

      if (name === "wgui-ext-find-campaign-characters" && body.campaign_id === 23) {
        return [];
      }

      throw new Error(`Unexpected mock call: ${name} ${JSON.stringify(body)}`);
    });
  });

  it("shows owned campaigns to the Owlbear GM", async () => {
    await expect(loadCampaignOptions("GM", undefined, session)).resolves.toEqual([
      {
        id: "23",
        name: "The Price of Prophecy (Production)",
        relation: "owner"
      }
    ]);
  });

  it("shows joined campaigns to an Owlbear player", async () => {
    await expect(loadCampaignOptions("PLAYER", undefined, session)).resolves.toEqual([
      {
        id: "24",
        name: "A Campaign I Play In",
        relation: "player"
      }
    ]);
  });

  it("uses wgui-ext-find-encounter and exposes every returned encounter option", async () => {
    const options = await loadEncounterOptions("23", "GM", undefined, session);

    expect(mocks.invoke).toHaveBeenCalledWith(
      "wgui-ext-find-encounter",
      { campaign_id: 23 },
      "test-access-token"
    );

    expect(options).toEqual([
      { id: "40", name: "wg combat test", combatantCount: 8 },
      { id: "41", name: "Getting the Darkwood", combatantCount: 13 },
      { id: "42", name: "test 2", combatantCount: 7 }
    ]);
  });

  it("loads the selected real WGUI encounter instead of the sample snapshot", async () => {
    const result = await loadEncounter(
      "GM",
      undefined,
      { campaignId: "23", fightId: "41" },
      session,
      "The Price of Prophecy (Production)"
    );

    expect(result.source).toBe("live");
    expect(result.snapshot.encounter.name).toBe("Getting the Darkwood");
    expect(result.snapshot.combatants).toHaveLength(13);
    expect(result.snapshot.combatants[0]).toMatchObject({
      id: "darkwood-1",
      name: "Darkwood Creature 1",
      side: "enemy",
      initiative: 20,
      level: 2,
      ac: 17,
      hp: { current: 18, max: 24, temp: 0 },
      perception: 6,
      saves: { fortitude: 7, reflex: 5, will: 4 }
    });

    expect(mocks.invoke).toHaveBeenCalledWith(
      "wgui-ext-find-encounter",
      { campaign_id: 23, id: 41 },
      "test-access-token"
    );
    expect(mocks.invoke).toHaveBeenCalledWith(
      "wgui-ext-find-campaign-characters",
      { campaign_id: 23 },
      "test-access-token"
    );
  });

  it("requires a WGUI session when the real backend is configured", async () => {
    await expect(loadEncounterOptions("23", "GM")).rejects.toThrow(
      "Sign in to Wanderer's Guide to load encounters."
    );
  });
});
