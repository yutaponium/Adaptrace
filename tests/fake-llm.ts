// A stand-in for an LLM CLI in tests: reads the prompt on stdin and answers
// according to the mode given as its argument.
const prompt = await new Response(Bun.stdin.stream()).text();
const mode = process.argv[2];
const answer = (verdict: string, body: string | null) =>
  JSON.stringify({ verdict, reason: `reason for ${verdict}`, body });

if (mode === "fail") {
  console.error("model not found");
  process.exit(3);
} else if (mode === "sleep") {
  await Bun.sleep(5000);
} else if (mode === "garbage") {
  console.log("I think it is fine.");
} else if (mode === "wrong-shape") {
  console.log(JSON.stringify({ verdict: "maybe", reason: 1 }));
} else if (mode === "whole-file") {
  console.log(
    answer(
      "major",
      "---\ntype: Hacked\n---\n\n# MFA の受け入れ基準\n\n- SMS のコードでもログインできる\n",
    ),
  );
} else if (mode === "extract") {
  console.log(
    JSON.stringify({
      documents: [
        {
          type: "Decision",
          id: "auth-provider",
          title: "認証基盤に IdP-X を使う",
          body: "認証基盤は IdP-X にする。",
          state: "accepted",
          depends_on: ["/requirements/mfa.md"],
        },
        {
          type: "Task",
          id: "build-login",
          title: "ログイン画面を実装する",
          owner: "tanaka",
          due: "2026-12-15",
          depends_on: ["#auth-provider"],
          satisfies: ["requirements/mfa.md"],
        },
        { type: "Risk", id: "Bad Id!", title: "IdP-X へのロックイン" },
        { type: "Meeting", title: "次回の会議" },
      ],
    }),
  );
} else if (mode === "extract-dangling") {
  console.log(
    JSON.stringify({
      documents: [{ type: "Task", id: "t", title: "T", depends_on: ["#none"] }],
    }),
  );
} else if (mode === "extract-empty") {
  console.log('{"documents": []}');
} else if (mode === "size-inexact") {
  console.log(JSON.stringify({ size: "small", hours: 1.1, work: "w" }));
} else if (mode === "size") {
  // Reopened tasks are large; milestones have no estimate; the rest small.
  const sizing = prompt.includes("so the change reopens it")
    ? { size: "large", hours: 8, work: "テストをやり直す" }
    : prompt.includes("type: Milestone")
      ? { size: "none", hours: null, work: "なし" }
      : { size: "small", hours: 1.5, work: "少し直す" };
  console.log(JSON.stringify({ ...sizing, reason: "r" }));
} else if (mode === "pair" && prompt.startsWith("Draft the invitation")) {
  console.log(
    JSON.stringify({
      subject: "変更要求の協議",
      body: "日時：（未定）\n議題：SMSの追加とメールの廃止",
    }),
  );
} else if (mode === "pair") {
  // Requests that both change requirements/mfa.md conflict; others are
  // compatible.
  const both = prompt.includes("Both would change requirements/mfa.md");
  console.log(
    JSON.stringify(
      both
        ? {
            verdict: "conflict",
            reason: "一方は方式を増やし、\n他方は絞る",
            decide: ["SMSを認めるか"],
          }
        : { verdict: "compatible", reason: "別の点を変える" },
    ),
  );
} else if (mode === "echo") {
  // Lets a test inspect the prompt through the reason.
  console.log(JSON.stringify({ verdict: "none", reason: prompt, body: null }));
} else {
  // Acceptance criteria get a new body, everything else is fine.
  const derived = prompt.includes(" derived_from ");
  const text = derived
    ? answer(
        "major",
        "\n# MFA の受け入れ基準\n\n- SMS のコードでもログインできる\n",
      )
    : answer("none", null);
  console.log(
    mode === "fenced" ? `Here you go:\n\`\`\`json\n${text}\n\`\`\`` : text,
  );
}

export {};
