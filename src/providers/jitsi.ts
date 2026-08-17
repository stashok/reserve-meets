const ADJECTIVES = [
  "Amber", "Ancient", "Atomic", "Brave", "Bright", "Calm", "Clever", "Clear",
  "Coral", "Cosmic", "Crystal", "Curious", "Daring", "Direct", "Eager", "Famous",
  "Fresh", "Frozen", "Gentle", "Golden", "Grand", "Happy", "Hidden", "Inner",
  "Kind", "Lively", "Lucky", "Lunar", "Merry", "Noble", "Open", "Polar",
  "Proud", "Quiet", "Rapid", "Sharp", "Silent", "Solar", "Super", "Swift",
  "Tiny", "Unique", "Velvet", "Vivid", "Warm", "Winter", "Wise", "Young",
];

const PLURAL_NOUNS = [
  "Anchors", "Banners", "Bridges", "Cameras", "Castles", "Circles", "Clouds", "Dragons",
  "Engines", "Flowers", "Forests", "Gardens", "Guitars", "Helmets", "Islands", "Jungles",
  "Knights", "Lanterns", "Laptops", "Letters", "Markets", "Numbers", "Oceans", "Orbits",
  "Papers", "Pictures", "Pirates", "Planets", "Players", "Quests", "Rivers", "Robots",
  "Rockets", "Rooms", "Schools", "Shadows", "Signals", "Sparks", "Stories", "Tables",
  "Tickets", "Tigers", "Valleys", "Villages", "Waves", "Wheels", "Windows", "Wizards",
];

const VERBS = [
  "Accept", "Build", "Change", "Debate", "Decide", "Enjoy", "Explore", "Follow",
  "Gather", "Handle", "Imagine", "Invent", "Join", "Keep", "Launch", "Listen",
  "Manage", "Measure", "Navigate", "Notice", "Offer", "Paint", "Question", "Rescue",
  "Search", "Teach", "Travel", "Unlock", "Visit", "Wonder",
];

const ADVERBS = [
  "Boldly", "Brightly", "Calmly", "Clearly", "Closely", "Deeply", "Directly", "Downwards",
  "Eagerly", "Fairly", "Firmly", "Freely", "Gently", "Gladly", "Happily", "Honestly",
  "Kindly", "Lightly", "Loudly", "Neatly", "Nicely", "Openly", "Perfectly", "Proudly",
  "Quickly", "Quietly", "Rapidly", "Safely", "Silently", "Simply", "Smoothly", "Softly",
  "Steadily", "Strongly", "Surely", "Swiftly", "Tightly", "Truly", "Warmly", "Wisely",
];

export function buildJitsiRoomName(namespace: string): string {
  const token = namespace.replace(/[^a-zA-Z0-9]/g, "");
  return `${pick(ADJECTIVES)}${pick(PLURAL_NOUNS)}${pick(VERBS)}${pick(ADVERBS)}${token}`;
}

export function buildJitsiUrl(baseUrl: string, namespace: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${buildJitsiRoomName(namespace)}`;
}

export function teacherLaunchUrl(joinUrl: string, settings: { muteOnOpen: boolean; teacherDisplayName: string }): string {
  const parts: string[] = [];
  if (settings.muteOnOpen) {
    parts.push("config.startWithAudioMuted=true");
    parts.push("config.startWithVideoMuted=true");
  }
  const displayName = settings.teacherDisplayName.trim();
  if (displayName) {
    parts.push(`userInfo.displayName="${encodeURIComponent(displayName)}"`);
  }
  return parts.length > 0 ? `${joinUrl}#${parts.join("&")}` : joinUrl;
}

function pick(words: string[]): string {
  return words[randomIndex(words.length)];
}

const NAMESPACE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function createRoomNamespace(): string {
  return randomString(NAMESPACE_ALPHABET, 8);
}

function randomIndex(length: number): number {
  const max = 256 - (256 % length);
  while (true) {
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    if (bytes[0] >= max) continue;
    return bytes[0] % length;
  }
}

function randomString(alphabet: string, length: number): string {
  const chars: string[] = [];
  while (chars.length < length) {
    chars.push(alphabet[randomIndex(alphabet.length)]);
  }
  return chars.join("");
}
