import {Address} from "locklift";
import lockliftConfig from "../locklift.config";

async function main() {
  const signer = (await locklift.keystore.getSigner("0"))!;
  const {contract: sample, tx} = await locklift.factory.deployContract({
    contract: "Sample",
    publicKey: signer.publicKey,
    initParams: {
      _randomNonce: locklift.utils.getRandomNonce(),
    },
    constructorParams: {
      owner: new Address('0:0000000000000000000000000000000000000000000000000000000000000000'),
    },
    value: locklift.utils.toNano(1),
  });
  console.log(`Sample deployed at: ${sample.address.toString()}`);

  await sample.methods.test().sendExternal({publicKey: signer.publicKey});
  console.log(await sample.fields._message());
  console.log(await sample.fields._hash());
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
