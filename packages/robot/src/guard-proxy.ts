import { request as httpRequest, createServer, type IncomingHttpHeaders } from "node:http";
import { connect as netConnect, type AddressInfo } from "node:net";
import { guardedLookup, type GuardOptions } from "@golive/probe/guard";

export interface GuardProxy {
  url: string;
  /** Connections refused because they resolved to a private or reserved address. */
  blocked: () => number;
  close: () => Promise<void>;
}

const HOP = ["proxy-connection", "proxy-authorization", "connection", "keep-alive", "te", "trailer", "transfer-encoding", "upgrade"];

/**
 * Local forward proxy that every browser connection goes through.
 * DNS is resolved here, at connect time, with the same guard as the passive probe:
 * a page cannot make the robot reach loopback, private or metadata addresses,
 * even through DNS rebinding.
 */
export function startGuardProxy(opts: GuardOptions): Promise<GuardProxy> {
  const lookup = guardedLookup(opts) as never;
  let blocked = 0;
  const onErr = (e: Error) => {
    if (e.name === "BlockedAddressError") blocked++;
  };

  const server = createServer((req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (target.protocol !== "http:") {
      res.writeHead(400).end();
      return;
    }
    const headers: IncomingHttpHeaders = { ...req.headers };
    for (const h of HOP) delete headers[h];
    const up = httpRequest(
      { host: target.hostname, port: target.port || 80, path: target.pathname + target.search, method: req.method, headers, lookup },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.setTimeout(20_000, () => up.destroy(new Error("timeout")));
    up.on("error", (e) => {
      onErr(e);
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });

  server.on("connect", (req, socket, head) => {
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url ?? "");
    if (!m) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const up = netConnect({ host: m[1], port: Number(m[2]), lookup }, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.setTimeout(30_000, () => up.destroy());
    up.on("error", (e) => {
      onErr(e);
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    socket.on("error", () => up.destroy());
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        blocked: () => blocked,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}
