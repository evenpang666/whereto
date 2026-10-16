import os from "node:os";

// Prefer a physical Ethernet interface; never accidentally advertise a VM/VPN address.
export function selectLan(interfaces = os.networkInterfaces()) {
  const candidates = Object.entries(interfaces).flatMap(([name, addresses]) =>
    /^(eth\d|en\w|以太网|ethernet)/i.test(name) &&
    !/virtual|vmware|vbox|vethernet|vpn|tunnel|docker|bridge|wlan|wi-?fi/i.test(name)
      ? (addresses || []).filter(a => a.family === "IPv4" && !a.internal && /^192\.168\.\d+\.\d+$/.test(a.address))
          .map(a => ({ name, address: a.address, netmask: a.netmask }))
      : []
  );
  return candidates[0] || null;
}
const ipv4 = address => address?.replace(/^::ffff:/, "");
export const isLoopback = address => ["127.0.0.1", "::1"].includes(ipv4(address));
export const isLocalHost = host => /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
const bits = ip => ip.split(".").reduce((n, v) => (n << 8) | Number(v), 0) >>> 0;
export function allowedClient(address, lan) {
  if (isLoopback(address)) return true;
  const ip = ipv4(address);
  return !!(lan && /^192\.168\.\d+\.\d+$/.test(ip || "") &&
    (bits(ip) & bits(lan.netmask)) === (bits(lan.address) & bits(lan.netmask)));
}
export function allowedHost(host, lan) {
  return isLocalHost(host) || !!(lan && host.split(":")[0] === lan.address && /^\d+$/.test(host.split(":")[1] || ""));
}
