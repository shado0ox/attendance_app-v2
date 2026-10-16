const PACKAGE = "com.xshadox.wafrdawam";
/** Only real operator-supplied signing identities are published. Empty settings authorize no app. */
export function nativeAssociations(teamId = "", certificates = "") {
  if (teamId && !/^[A-Z0-9]{10}$/.test(teamId))
    throw new Error(
      "APPLE_TEAM_ID must be the real ten-character Apple team identifier",
    );
  const fingerprints = [
    ...new Set(
      certificates
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (
    fingerprints.length > 10 ||
    fingerprints.some(
      (value) => !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value),
    )
  )
    throw new Error(
      "ANDROID_APP_CERT_SHA256 must contain exact colon-separated SHA-256 certificate fingerprints",
    );
  return {
    apple: { webcredentials: { apps: teamId ? [`${teamId}.${PACKAGE}`] : [] } },
    android: fingerprints.length
      ? [
          {
            relation: ["delegate_permission/common.get_login_creds"],
            target: {
              namespace: "android_app",
              package_name: PACKAGE,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [],
    origins: fingerprints.map(
      (value) =>
        "android:apk-key-hash:" +
        Buffer.from(value.replaceAll(":", ""), "hex").toString("base64url"),
    ),
  };
}
