import {Address, toNano} from "locklift";
import lockliftConfig from "../locklift.config";

async function main() {
  const signer = (await locklift.keystore.getSigner("0"))!;
  const {contract: sample, tx} = await locklift.factory.deployContract({
    contract: "ChatRoot",
    publicKey: signer.publicKey,
    initParams: {
      _randomNonce: 0
      // _randomNonce: locklift.utils.getRandomNonce(),
    },
    constructorParams: {
      platformCode: locklift.factory.getContractArtifacts('Platform').code,
      profileCode: locklift.factory.getContractArtifacts('ChatProfile').code,
      roomCode: locklift.factory.getContractArtifacts('Channel').code,
      sendMessageValue: toNano(0.1),
      serverCode: locklift.factory.getContractArtifacts('Chat').code,
    },
    value: locklift.utils.toNano(2),
  });
  console.log(`Root deployed at: ${sample.address.toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
