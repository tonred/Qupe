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
      admin: new Address('0:fa94171cb0565789224814561cc558e59315971ee9d03085de3dcb5f8b94d95e'),
      profileCode: locklift.factory.getContractArtifacts('ChatProfile').code,
      serverCode: locklift.factory.getContractArtifacts('Chat').code,
      roomCode: locklift.factory.getContractArtifacts('Channel').code,
      platformCode: locklift.factory.getContractArtifacts('Platform').code,
      sendMessageValue: toNano(0.1),
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
