import { makeRoot } from "../src/iti"

import { provideAContainer } from "./mocks/container.a"
import { provideBContainer } from "./mocks/container.b"

describe("Node long chain async", () => {
  let root: ReturnType<typeof makeRoot>

  beforeEach(() => {
    root = makeRoot()
  })

  it("should test long chain", (cb) => {
    ;(async () => {
      let r = root
        .add({ a: "A" })
        .add({ k: "K" })
        .upsert((c, node) => ({
          a: 22,
          c: async () => {
            expect(c.a).toBe(22)
            return "C"
          },
        }))
        .upsert((c, node) => ({
          b: "B",
          c: async () => {
            expect(node.get("a")).toBe(22)
            return "C"
          },
        }))
        .add(() => {
          return { f: "F", g: "G" }
        })

      await expect(r.get("c")).resolves.toBe("C")

      expect(r.get("f")).toBe("F")
      expect(r.get("a")).toBe(22)

      r.upsert({ a: "new A" })
      expect(r.get("a")).toBe("new A")
      cb()
    })()
  }, 100)
  it("should test if I can overwrite token", (cb) => {
    ;(async () => {
      let r = root.add({ a: "A", b: "B" })
      expect(r.get("a")).toBe("A") // Stores in cache

      let n = r.upsert({ a: 22 })
      let m: number = await n.get("a")
      expect(m).toBe(22)
      cb()
    })()
  })

  it("should test if I can overwrite token without sealing", (cb) => {
    ;(async () => {
      let r = root.add({ a: "A", b: "B" })
      expect(await r.get("a")).toBe("A") // Stores in cache

      let n = r.upsert({ a: 22 })
      let m: number = await n.get("a")
      expect(m).toBe(22)
      cb()
    })()
  })

  it("should send containerUpdated event on overwrite", (cb) => {
    ;(async () => {
      root.on("containerUpdated", (k) => {
        expect(k.key).toBe("a")
        expect(k.newContainer).toBe(22)
        cb()
      })

      let r = root.add({ a: "A", b: "B" })
      expect(await r.get("a")).toBe("A") // Stores in cache

      let n = r.upsert({ a: 22 })
      let m: number = await n.get("a")
      expect(m).toBe(22)
    })()
  })

  it("should test if I can overwrite token and request it inside node", (cb) => {
    ;(async () => {
      let sub = jest.fn()
      root.on("containerUpdated", sub)
      let r = root
        .add({ a: "A" })
        .upsert((c) => {
          expect(c.a).toBe("A")
          return { a: 22 }
        })
        .add((containers) => {
          expect(containers.a).toBe(22)
          return { b: "B", c: "C" }
        })

      expect(r.get("a")).toBe(22)

      r.upsert({ a: "new A" })
      expect(r.get("a")).toBe("new A")
      expect(sub).toHaveBeenCalledTimes(2)
      cb()
    })()
  }, 100)
})

describe("Node subscribeToContiner", () => {
  let root: ReturnType<typeof makeRoot>

  beforeEach(() => {
    root = makeRoot()
  })

  it("should subscribe to async container creation", (cb) => {
    const node = root.add(() => ({
      a: async () => "A",
      b: async () => "B",
    }))
    node.subscribeToContainer("a", async (err, container) => {
      expect(await container).toBe("A")
    })
    node.get("a").then(() => {
      cb()
    })
  })
  it("should handle err on subscribes well ", (cb) => {
    const node = root.add(() => ({
      a: async () => "A",
      b: async () => {
        throw "B"
      },
    }))

    node.subscribeToContainer("b", async (err, container) => {
      if (err) {
        expect(err).toBe("B")
      }
    })
    node
      .get("b")
      .then(() => {})
      .catch((e) => {
        expect(e).toBe("B")
        cb()
      })
  })

  it("should not fire an event on a sync node", (cb) => {
    ;(async () => {
      const node = root.add({
        a: async () => "A",
        b: "B",
      })
      let f1 = jest.fn()
      let f2 = jest.fn()
      node.subscribeToContainer("a", f1)

      await node.get("a")
      node.get("b")
      node.subscribeToContainer("b", f2)

      expect(f1).toBeCalled()
      expect(f2).not.toBeCalled()
      cb()
    })()
  })

  it("should handle err on subscribeToContainerSet", (cb) => {
    ;(async () => {
      const node = root
        .add(() => ({
          a: async () => "A",
          b: "B",
        }))
        .add(() => ({
          c: async () => {
            throw "C"
          },
        }))
      let f3 = jest.fn()
      node.subscribeToContainerSet(["a", "c"], (err, containers) => {
        if (err) {
          expect(err).toBe("C")
        }
      })
      node.subscribeToContainerSet((c) => [c.a, c.c], f3)

      try {
        await node.get("c")
      } catch (e) {
        expect(e).toBe("C")
        setTimeout(cb, 10)
      }
    })()
  })

  it("should use containerSet to subscribe to events", (cb) => {
    ;(async () => {
      const node = root
        .add(() => ({
          a: async () => "A",
          b: "B",
        }))
        .add(() => ({
          c: async () => "C",
          d: "D",
        }))
      // await node.get("a")
      let f1 = jest.fn()
      let f2 = jest.fn()
      let f3 = jest.fn()
      let f4 = jest.fn()

      node.subscribeToContainerSet(["a", "c"], f1)
      node.subscribeToContainerSet(["c", "d"], f2)
      // TODO: Warning, if called before seal, this will fail
      node.subscribeToContainerSet((c) => [c.a, c.c], f3)
      node.subscribeToContainerSet((c) => [c.c, c.d], f4)
      await node.get("c")
      await node.get("c")
      await node.get("c")
      await node.get("b")
      await node.get("a")
      // await node.get((c) => c.a)
      /**
       * 2 becaus we have subscribed to two container, and this will provide us
       * with two of those, hence two updates because two creations
       */
      expect(f1).toHaveBeenCalledTimes(2)
      // One because D is stored as a value on seal creation
      expect(f2).toHaveBeenCalledTimes(2)
      expect(f3).toHaveBeenCalledTimes(2)
      expect(f4).toHaveBeenCalledTimes(2)
      cb()
    })()
  })
})

describe("Node getter", () => {
  let root: ReturnType<typeof makeRoot>

  beforeEach(() => {
    root = makeRoot()
  })

  it("should get nested conatainers", (cb) => {
    ;(async () => {
      const node1 = root.add({
        aCont: async () => provideAContainer(),
      })
      const node2 = node1.add({
        bCont: async () => provideBContainer(await node1.get("aCont")),
      })
      const containers = node2.containers

      expect(containers).toHaveProperty("bCont")
      expect(containers.aCont).toBeInstanceOf(Promise)

      let b = await containers.bCont
      expect(b).toHaveProperty("b2")
      expect(b).toMatchSnapshot()

      cb()
    })()
  })
})

describe("Node add", () => {
  let root: ReturnType<typeof makeRoot>
  let node: ReturnType<typeof mockNode>

  function mockNode() {
    return makeRoot().add({
      a: "A",
      b: () => "B",
      c: async () => "C",
      d: async () => "D",
    })
  }
  beforeEach(() => {
    root = makeRoot()
    node = mockNode()
  })

  it("should be able to chain multiple nodes", async () => {
    let r = root.add({ a: "A" }).add({ b: "B" }).add({ c: "C" }).add({ d: "D" })

    expect(r.get("a")).toBe("A")
    expect(r.get("c")).toBe("C")
  })

  it("should accept callback function that provides current node", async () => {
    let r = await root
      .add({ a: "A" })
      .add({ k: "A" })
      .add((containers) => {
        expect(containers.a).toBe("A")
        return { b: "B", c: "C" }
      })
      .add((containers, node) => {
        expect(node.get("b")).toBe("B")
        return { f: "F", g: "G" }
      })
    expect(r.get("f")).toBe("F")
  })

  it("should be able to add node in safe way", () => {
    let n = root.add({ a: "A", b: "B", c: "C" })

    expect(() => {
      // @ts-expect-error
      n.add({ a: "A", b: "B2" })
    }).toThrow()
  })

  it("should be able to add an async node", (cb) => {
    // We need to test if typescript throws a type error here
    enum UniqueResult {
      A,
      B,
      F,
    }
    ;(async () => {
      let node = await root
        .add({
          a: UniqueResult.A,
          b: () => UniqueResult.B,
        })
        .add(() => ({
          f: async () => UniqueResult.F,
        }))

      await expect(node.get("f")).resolves.toBe(UniqueResult.F)
      // @ts-expect-error
      let a: UniqueResult.A = await node.get("f")
      cb()
    })()
  })

  it("should handle a node with out of order execution", (cb) => {
    ;(async () => {
      let node = root
        .add((c) => {
          return {
            a: () => "A",
            b: () => "B",
          }
        })
        .add((c) => {
          return {
            c: () => "C",
          }
        })
        .add((c, node) => {
          return {
            d: () => "D",
            cd: () => node.get("c") + "D",
          }
        })

      let r = node.get("a") + node.get("c") + node.get("d")
      expect(r).toBe("ACD")
      let r2 = node.get("b") + node.get("cd")
      expect(r2).toBe("BCD")

      cb()
    })()
  }, 100)
})

describe("Node getContainerSet", () => {
  let root: ReturnType<typeof makeRoot>
  let node: ReturnType<typeof mockNode>
  function mockNode() {
    return makeRoot().add({
      a: "A",
      b: () => "B",
      c: async () => "C",
      d: async () => "D",
    })
  }
  beforeEach(() => {
    root = makeRoot()
    node = mockNode()
  })

  it("should get container set based of primitive values", async () => {
    await expect(node.getContainerSet(["a", "b"])).resolves.toMatchObject({
      a: "A",
      b: "B",
    })
    await expect(
      node.getContainerSet((c) => [c.a, c.b]),
    ).resolves.toMatchObject({
      a: "A",
      b: "B",
    })
  })

  it("should get container set of only resolved promises", async () => {
    await expect(node.getContainerSet(["c", "d"])).resolves.toMatchObject({
      c: "C",
      d: "D",
    })

    await expect(
      node.getContainerSet((c) => [c.c, c.d]),
    ).resolves.toMatchObject({
      c: "C",
      d: "D",
    })
  })

  it("should get container set based literals and resolved promises", async () => {
    await expect(node.getContainerSet(["a", "c"])).resolves.toMatchObject({
      a: "A",
      c: "C",
    })

    await expect(
      node.getContainerSet((c) => [c.a, c.c]),
    ).resolves.toMatchObject({
      a: "A",
      c: "C",
    })
  })

  it("should get container set via callback API", async () => {
    await expect(
      node.getContainerSet((c) => [c.a, c.c]),
    ).resolves.toMatchObject({
      a: "A",
      c: "C",
    })
  }, 100)
})
