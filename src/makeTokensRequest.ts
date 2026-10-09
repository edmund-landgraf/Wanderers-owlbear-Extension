import OBR from "@owlbear-rodeo/sdk";
import { SVG_TOKEN_CHANNEL, type MakeTokenRequest } from "./makeTokens";

const ACK_WAIT_MS = 2000;
const RESULT_WAIT_MS = 60000;

type TokenReply = { type?: string; requestId?: string; ok?: boolean; count?: number; error?: string };

export async function requestSvgTokens(tokens: MakeTokenRequest[]): Promise<number> {
  if (!OBR.isAvailable) {
    throw new Error("Load SVG Token Owlbear in this room.");
  }
  if (!OBR.isReady) {
    await new Promise<void>((resolve) => OBR.onReady(resolve));
  }

  const requestId = crypto.randomUUID();
  const reply = await new Promise<TokenReply>((resolve, reject) => {
    let timer = window.setTimeout(
      () => finish(new Error("SVG Token Owlbear is in the room, but it did not acknowledge the request.")),
      ACK_WAIT_MS
    );
    const unsubscribe = OBR.broadcast.onMessage(SVG_TOKEN_CHANNEL, (message) => {
      const data = message.data as TokenReply | undefined;
      if (!data || data.requestId !== requestId) return;
      if (data.type === "CREATE_TOKENS_ACK") {
        window.clearTimeout(timer);
        timer = window.setTimeout(
          () => finish(new Error("SVG Token Owlbear did not finish creating tokens.")),
          RESULT_WAIT_MS
        );
        return;
      }
      if (data.type === "CREATE_TOKENS_RESULT") finish(data);
    });

    function finish(value: TokenReply | Error) {
      window.clearTimeout(timer);
      unsubscribe();
      if (value instanceof Error) reject(value);
      else resolve(value);
    }

    void OBR.broadcast.sendMessage(
      SVG_TOKEN_CHANNEL,
      { type: "CREATE_TOKENS", requestId, tokens },
      { destination: "LOCAL" }
    ).catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error("Unable to reach SVG Token Owlbear."));
    });
  });

  if (!reply.ok) throw new Error(reply.error || "Unable to create tokens.");
  return reply.count ?? tokens.length;
}
