import { describe, it, expect } from "vitest";
import { sessionStore } from "../../src/context.js";

describe("sessionStore", () => {
  it("run() 안에서 getStore()로 credential 조회 가능", () => {
    sessionStore.run({ msalAccountId: "test-id" }, () => {
      const store = sessionStore.getStore();
      expect(store).toBeDefined();
      expect(store!.msalAccountId).toBe("test-id");
    });
  });

  it("run() 밖에서 getStore()는 undefined 반환", () => {
    expect(sessionStore.getStore()).toBeUndefined();
  });

  it("멀티유저 격리: 두 개의 동시 run이 각각 다른 값을 가짐", async () => {
    const results = await Promise.all([
      new Promise<string | undefined>((resolve) => {
        sessionStore.run({ msalAccountId: "user-a" }, () => {
          // 비동기 경계 추가
          setTimeout(() => {
            resolve(sessionStore.getStore()?.msalAccountId);
          }, 0);
        });
      }),
      new Promise<string | undefined>((resolve) => {
        sessionStore.run({ msalAccountId: "user-b" }, () => {
          setTimeout(() => {
            resolve(sessionStore.getStore()?.msalAccountId);
          }, 0);
        });
      }),
    ]);

    expect(results[0]).toBe("user-a");
    expect(results[1]).toBe("user-b");
  });

  it("중첩된 run에서 내부 값이 외부를 덮어씀", () => {
    sessionStore.run({ msalAccountId: "outer" }, () => {
      expect(sessionStore.getStore()?.msalAccountId).toBe("outer");

      sessionStore.run({ msalAccountId: "inner" }, () => {
        expect(sessionStore.getStore()?.msalAccountId).toBe("inner");
      });

      expect(sessionStore.getStore()?.msalAccountId).toBe("outer");
    });
  });
});
