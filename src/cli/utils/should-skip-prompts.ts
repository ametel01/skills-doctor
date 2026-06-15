export type PromptSkipInput = {
  readonly yes?: boolean;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly stdinIsTty?: boolean;
};

const NON_INTERACTIVE_ENV_KEYS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "BUILDKITE",
  "JENKINS_URL",
  "TF_BUILD",
  "CODEBUILD_BUILD_ID",
  "TEAMCITY_VERSION",
  "BITBUCKET_BUILD_NUMBER",
  "CIRCLECI",
  "TRAVIS",
  "DRONE",
  "GIT_DIR",
  "CODEX_SANDBOX",
  "CLAUDECODE",
];

export const shouldSkipPrompts = (input: PromptSkipInput = {}): boolean => {
  const env = input.env ?? process.env;
  return (
    Boolean(input.yes) ||
    Boolean(input.json) ||
    input.stdinIsTty === false ||
    NON_INTERACTIVE_ENV_KEYS.some((key) => Boolean(env[key]))
  );
};
