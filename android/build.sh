#!/usr/bin/env bash
# Збирає APK без Android Studio і Gradle: aapt2 → javac → d8 → zipalign → apksigner.
#
#   ./build.sh                                  — для телефона (сайт https://backerydot.github.io/Claude/)
#   SITE_URL=http://10.0.2.2:8000/ ./build.sh   — для перевірки в емуляторі з локальним сервером
#
# Готовий файл: android/build/deutsch-trainer.apk
# Ключ підпису лежить у ~/Android/keys — НЕ в репозиторії. Не губіть його:
# без того самого ключа телефон не дасть оновити застосунок (тільки видалити й поставити заново).
set -euo pipefail
cd "$(dirname "$0")"

VERSION_CODE=2      # збільшуйте на 1 з кожною новою версією
VERSION_NAME=1.1

JAVA_HOME=${JAVA_HOME:-$(ls -d ~/.local/opt/jdk-17* | head -1)}
ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
export PATH=$JAVA_HOME/bin:$PATH
BT=$ANDROID_HOME/build-tools/35.0.0
JAR=$ANDROID_HOME/platforms/android-35/android.jar
KEYS=$HOME/Android/keys
OUT=build

rm -rf $OUT
mkdir -p $OUT/gen $OUT/classes $OUT/dex
cp -r res $OUT/res
cp AndroidManifest.xml $OUT/
if [ -n "${SITE_URL:-}" ]; then
  sed -i "s#https://backerydot.github.io/Claude/#$SITE_URL#" $OUT/res/values/strings.xml
  sed -i 's#usesCleartextTraffic="false"#usesCleartextTraffic="true"#' $OUT/AndroidManifest.xml
fi

# Ключ підпису створюється один раз
if [ ! -f $KEYS/deutsch-trainer.jks ]; then
  mkdir -p $KEYS && chmod 700 $KEYS
  head -c 24 /dev/urandom | base64 > $KEYS/password.txt && chmod 600 $KEYS/password.txt
  keytool -genkeypair -keystore $KEYS/deutsch-trainer.jks -alias dt -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass "$(cat $KEYS/password.txt)" -dname "CN=Deutsch-Trainer" 2>/dev/null
  echo "Створено ключ підпису: $KEYS/deutsch-trainer.jks"
fi

echo "1/5 ресурси"
$BT/aapt2 compile --dir $OUT/res -o $OUT/res.zip
$BT/aapt2 link -o $OUT/unsigned.apk -I $JAR --manifest $OUT/AndroidManifest.xml --java $OUT/gen \
  --min-sdk-version 26 --target-sdk-version 34 \
  --version-code $VERSION_CODE --version-name $VERSION_NAME $OUT/res.zip

echo "2/5 java"
javac --release 11 -encoding UTF-8 -Xlint:-options -classpath $JAR -d $OUT/classes \
  $(find src $OUT/gen -name '*.java')

echo "3/5 dex"
$BT/d8 --release --min-api 26 --lib $JAR --output $OUT/dex $(find $OUT/classes -name '*.class')
(cd $OUT/dex && zip -q -u ../unsigned.apk classes.dex)

echo "4/5 вирівнювання"
$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk

echo "5/5 підпис"
$BT/apksigner sign --ks $KEYS/deutsch-trainer.jks --ks-pass file:$KEYS/password.txt \
  --out $OUT/deutsch-trainer.apk $OUT/aligned.apk
$BT/apksigner verify $OUT/deutsch-trainer.apk
echo "Готово: $(pwd)/$OUT/deutsch-trainer.apk ($(du -h $OUT/deutsch-trainer.apk | cut -f1))"
