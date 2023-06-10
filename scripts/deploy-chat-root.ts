import {Address} from "locklift";
import lockliftConfig from "../locklift.config";

async function main() {
  const signer = (await locklift.keystore.getSigner("0"))!;
  const {contract: sample, tx} = await locklift.factory.deployContract({
    contract: "Root",
    publicKey: signer.publicKey,
    initParams: {
      _randomNonce: 0
      // _randomNonce: locklift.utils.getRandomNonce(),
    },
    constructorParams: {
      codes: {
        forum: locklift.factory.getContractArtifacts('Forum').code,
        chat: locklift.factory.getContractArtifacts('Chat').code,
        blog: locklift.factory.getContractArtifacts('Blog').code,
        topic: locklift.factory.getContractArtifacts('Topic').code,
        channel: locklift.factory.getContractArtifacts('Channel').code,
        page: locklift.factory.getContractArtifacts('Page').code,
        message: locklift.factory.getContractArtifacts('Message').code,
        profile: locklift.factory.getContractArtifacts('Profile').code,
      },
      platformCode: locklift.factory.getContractArtifacts('Platform').code
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
