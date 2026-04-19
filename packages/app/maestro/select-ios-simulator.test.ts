import { describe, expect, test } from "vitest";
import { selectPreferredIPhoneSimulatorId } from "./select-ios-simulator";

describe("selectPreferredIPhoneSimulatorId", () => {
  test("prefers a booted available iPhone simulator", () => {
    const output = `== Devices ==
-- iOS 18.2 --
    iPad Pro (M4) (AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA) (Booted)
    iPhone 16 Pro (BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB) (Booted)
    iPhone 16 (CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC) (Shutdown)
-- tvOS 18.2 --
    Apple TV (DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD) (Booted)
`;

    expect(selectPreferredIPhoneSimulatorId(output)).toBe("BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB");
  });

  test("falls back to an available iPhone simulator when none are booted", () => {
    const output = `== Devices ==
-- iOS 18.2 --
    iPad Air 13-inch (M2) (AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA) (Shutdown)
    iPhone 16 Pro (BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB) (Shutdown)
    iPhone SE (3rd generation) (CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC) (Shutdown)
-- watchOS 11.2 --
    Apple Watch Series 10 (44mm) (DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD) (Shutdown)
`;

    expect(selectPreferredIPhoneSimulatorId(output)).toBe("BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB");
  });

  test("returns null when only non-iPhone devices exist", () => {
    const output = `== Devices ==
-- iOS 18.2 --
    iPad Pro (M4) (AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA) (Booted)
-- tvOS 18.2 --
    Apple TV (BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB) (Shutdown)
`;

    expect(selectPreferredIPhoneSimulatorId(output)).toBeNull();
  });
});
