const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      enum: [
        "USER_REGISTER",
        "USER_LOGIN",
        "USER_LOGOUT",
        "ELECTION_CREATED",
        "ELECTION_STARTED",
        "ELECTION_ENDED",
        "ELECTION_DELETED",
        "CANDIDATE_ADDED",
        "CANDIDATE_REMOVED",
        "VOTER_APPROVED",
        "VOTE_SUBMITTED",
        "VOTE_VERIFIED",
        "ADMIN_ACTION",
        "AUTH_FAILURE",
      ],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    // Only createdAt matters for logs; suppress updatedAt
    versionKey: false,
  }
);

// Auto-expire old logs after 1 year (TTL index)
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31_536_000 });

module.exports = mongoose.model("Log", logSchema);
