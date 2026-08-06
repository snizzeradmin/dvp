const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Candidate name is required"],
      trim: true,
      maxlength: [150, "Name cannot exceed 150 characters"],
    },
    party: {
      type: String,
      required: [true, "Political party is required"],
      trim: true,
      maxlength: [150, "Party name cannot exceed 150 characters"],
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, "Bio cannot exceed 1000 characters"],
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: true,
    },
    // 0-indexed position in the smart contract's candidates array
    blockchainId: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Candidate", candidateSchema);
